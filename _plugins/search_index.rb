require 'json'

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

module Jekyll
  class SearchIndexGenerator < Generator
    safe true
    priority :low

    OUTPUT_DIR = 'assets/js'.freeze
    OUTPUT_FILE = 'search-data.json'.freeze

    def generate(site)
      started_at = Time.now
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

      page = PageWithoutAFile.new(site, site.source, OUTPUT_DIR, OUTPUT_FILE)
      page.content = JSON.generate(documents)
      page.data['layout'] = nil
      page.data['sitemap'] = false
      site.pages << page

      Jekyll.logger.info(
        'SearchIndex:',
        "wrote #{documents.size} documents to /#{OUTPUT_DIR}/#{OUTPUT_FILE} in #{format('%.2fs', Time.now - started_at)}"
      )
    end

    private

    def skip?(page)
      url = page.url.to_s
      return true if url.include?('assets')
      return true if url.end_with?('.xml', '.json', '.txt')
      return true if url.end_with?('/search/') || url == '/search/'
      false
    end

    def document_for(page, id, post: false)
      data = page.data || {}
      tags = Array(data['tags']).compact.map(&:to_s)
      gallery_directory = data['gallery-directory'].to_s

      image_tags_str = ''
      raw_image_tags = data['image_tags']
      if raw_image_tags.is_a?(Hash)
        buf = []
        raw_image_tags.each_value do |values|
          next unless values.is_a?(Array)
          values.each { |v| buf << v.to_s }
        end
        image_tags_str = buf.join(' ')
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
        'title' => data['title'].to_s,
        'gallery-directory' => gallery_directory,
        'tags' => tags,
        'image_tags' => image_tags_str,
        'body' => body,
      }
    end

    def strip_body(raw)
      return '' if raw.nil? || raw.empty?
      # Lightweight HTML-ish stripping — good enough for search indexing.
      text = raw.gsub(/<[^>]+>/, ' ')
      text.gsub!(/\s+/, ' ')
      text.strip!
      (text || '')[0, 2000]
    end
  end
end
