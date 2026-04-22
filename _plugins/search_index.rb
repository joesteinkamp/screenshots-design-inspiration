require 'json'
require 'fileutils'

# Build the Lunr search index as a static JSON file.
#
# The Liquid version of this (a `{% for page in site.pages %}` loop in
# _includes/search-lunr.html with markdownify + strip_html + chained replace
# filters on every page) is the single slowest template in the build — with
# ~400 gallery pages each owning dozens of image_tag entries, rendering
# search.html alone can stall `jekyll build` for minutes and shows up in
# verbose logs as a hang on "Rendering Liquid: search.html".
#
# Running the same extraction in Ruby once, at generate-time, skips Liquid
# entirely and lets the browser fetch the resulting JSON asynchronously.
#
# We write the JSON file directly to site.dest in :post_write rather than
# via PageWithoutAFile because that path renders the file through Liquid,
# and any `{% ... %}` or `{{ ... }}` snippets that survive the body strip
# (e.g. raw template source from index.html) would otherwise be re-evaluated
# inside the JSON content and produce malformed output (browsers report
# "Bad control character in string literal in JSON" when this happens).

module Jekyll
  module SearchIndex
    OUTPUT_DIR = 'assets/js'.freeze
    OUTPUT_FILE = 'search-data.json'.freeze
    BODY_LIMIT = 2000

    class << self
      def build(site)
        documents = []
        id = 0

        site.pages.each do |page|
          next if skip?(page)
          documents << document_for(page, id)
          id += 1
        end

        posts = site.posts.respond_to?(:docs) ? site.posts.docs : []
        posts.each do |post|
          documents << document_for(post, id, post: true)
          id += 1
        end

        documents
      end

      def skip?(page)
        url = page.url.to_s
        return true if url.include?('assets')
        return true if url.end_with?('.xml', '.json', '.txt')
        return true if url.end_with?('/search/') || url == '/search/'
        false
      end

      def document_for(page, id, post: false)
        data = page.data || {}
        tags = Array(data['tags']).compact.map { |t| sanitize(t.to_s) }
        gallery_directory = sanitize(data['gallery-directory'].to_s)

        image_tags = []
        raw_image_tags = data['image_tags']
        if raw_image_tags.is_a?(Hash)
          raw_image_tags.each_value do |values|
            next unless values.is_a?(Array)
            values.each { |v| image_tags << sanitize(v.to_s) }
          end
        end

        body = ''
        if gallery_directory.empty?
          body = strip_body(page.content.to_s)
          if post && data['date']
            begin
              body = "#{data['date'].strftime('%Y/%m/%d')} - #{body}"
            rescue StandardError
              # ignore date formatting failures
            end
          end
        end

        site_url = page.site.config['url'].to_s
        {
          'id' => id,
          'url' => "#{site_url}#{page.url}",
          'title' => sanitize(data['title'].to_s),
          'gallery-directory' => gallery_directory,
          'tags' => tags,
          'image_tags' => image_tags,
          'body' => body,
        }
      end

      def strip_body(raw)
        return '' if raw.nil? || raw.empty?
        text = raw.dup
        # Strip Liquid blocks/expressions before stripping HTML so that
        # template source from utility pages (e.g. index.html) doesn't
        # leak into the search body.
        text.gsub!(/\{%.*?%\}/m, ' ')
        text.gsub!(/\{\{.*?\}\}/m, ' ')
        text.gsub!(/<[^>]+>/, ' ')
        text = sanitize(text)
        text.gsub!(/\s+/, ' ')
        text.strip!
        (text || '')[0, BODY_LIMIT]
      end

      # Drop control characters that JSON.generate could leave in literal
      # form (it only escapes \b \t \n \f \r among 0x00–0x1F) and that
      # break JSON.parse on the client side.
      def sanitize(str)
        return '' if str.nil?
        str.gsub(/[\x00-\x08\x0B\x0C\x0E-\x1F]/, ' ')
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_write do |site|
  started_at = Time.now
  documents = Jekyll::SearchIndex.build(site)
  output_path = File.join(site.dest, Jekyll::SearchIndex::OUTPUT_DIR, Jekyll::SearchIndex::OUTPUT_FILE)
  FileUtils.mkdir_p(File.dirname(output_path))
  File.write(output_path, JSON.generate(documents))
  Jekyll.logger.info(
    'SearchIndex:',
    "wrote #{documents.size} documents to /#{Jekyll::SearchIndex::OUTPUT_DIR}/#{Jekyll::SearchIndex::OUTPUT_FILE} in #{format('%.2fs', Time.now - started_at)}"
  )
end
