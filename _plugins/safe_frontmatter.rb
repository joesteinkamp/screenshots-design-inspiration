require 'json'
require 'yaml'
require 'pathname'

# Safety net against malformed YAML frontmatter in `*/index.html` files.
#
# Pipeline:
#   1. Contributor submits a PR with a typo in `image_tags`.
#   2. `scripts/validate-frontmatter.mjs --fix` runs in CI and usually repairs it.
#   3. If a typo slips through (e.g. a brand-new class of error the validator
#      doesn't know), Jekyll would normally throw Psych::SyntaxError and kill
#      the build. This plugin rescues that case so the product page still
#      renders (minus tags) and the rest of the site builds normally.
#
# Every rescue is appended to `_build_warnings.json` at the repo root so CI
# and the PR validator can show contributors exactly what went wrong.

module Jekyll
  module SafeFrontmatter
    WARNINGS_FILE = '_build_warnings.json'.freeze

    def self.append_warning(site, warning)
      path = File.join(site.source, WARNINGS_FILE)
      existing = []
      if File.exist?(path)
        begin
          existing = JSON.parse(File.read(path, encoding: 'UTF-8'))
        rescue JSON::ParserError
          existing = []
        end
      end
      existing << warning
      File.write(path, JSON.generate(existing) + "\n")
    end

    def self.fallback_data_for(index_path)
      parent_dir = File.basename(File.dirname(index_path))
      data = {
        'layout' => 'gallery',
        'gallery-directory' => parent_dir,
        'tags' => [],
      }
      tags_json_path = File.join(File.dirname(index_path), 'tags.json')
      if File.exist?(tags_json_path)
        begin
          parsed = JSON.parse(File.read(tags_json_path, encoding: 'UTF-8'))
          if parsed.is_a?(Hash)
            image_tags = {}
            parsed.each { |k, v| image_tags[k] = v if v.is_a?(Array) }
            data['image_tags'] = image_tags unless image_tags.empty?
          end
        rescue StandardError
          # tags.json also broken — proceed without image_tags
        end
      end
      data
    end
  end
end

# Monkey-patch Jekyll::Page to rescue YAML errors during frontmatter read.
# This keeps a malformed file from killing the build — the page still
# renders via the gallery layout, just with synthesized minimal data.
module Jekyll
  class Page
    alias_method :__safe_frontmatter_original_read_yaml, :read_yaml unless method_defined?(:__safe_frontmatter_original_read_yaml)

    def read_yaml(base, name, opts = {})
      __safe_frontmatter_original_read_yaml(base, name, opts)
    rescue Psych::SyntaxError, StandardError => e
      full_path = File.join(base, name)
      # Only intervene for the content files we own. Anything else should
      # still fail loud — this shouldn't silently mask unrelated bugs.
      unless full_path.end_with?('/index.html') &&
             %w[Mobile Web Email].any? { |p| full_path.include?("/#{p}/") }
        raise
      end

      warning = {
        'file' => Pathname.new(full_path).relative_path_from(Pathname.new(@site.source)).to_s,
        'rule' => 'jekyll-read-fallback',
        'message' => "YAML frontmatter unparseable (#{e.class.name}): #{e.message.to_s[0, 300]}. Rendered with minimal fallback frontmatter.",
      }
      Jekyll.logger.warn('SafeFrontmatter:', "#{warning['file']} → #{e.message.to_s[0, 200]}")
      Jekyll::SafeFrontmatter.append_warning(@site, warning)

      # Load file body without frontmatter.
      raw = File.read(full_path, encoding: 'UTF-8')
      body = raw.sub(/\A---\s*\n.*?\n---\s*\n?/m, '')
      self.content = body
      self.data = Jekyll::SafeFrontmatter.fallback_data_for(full_path)
      self.data
    end
  end
end

# Reset the warnings file at the start of each build so stale entries from a
# previous run don't show up in reports.
Jekyll::Hooks.register :site, :after_reset do |site|
  path = File.join(site.source, Jekyll::SafeFrontmatter::WARNINGS_FILE)
  File.write(path, "[]\n")
end
