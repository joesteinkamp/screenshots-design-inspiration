require 'json'
require 'yaml'

module Jekyll
  class ProductsJsonGenerator < Generator
    safe true
    priority :low

    def generate(site)
      products = []
      tag_counts = Hash.new(0)
      screenshot_tag_counts = Hash.new(0)

      dirs_to_scan = ['Mobile', 'Web', 'Email']
      image_extensions = ['.png', '.jpg', '.jpeg', '.gif']

      dirs_to_scan.each do |dir|
        base_path = File.join(site.source, dir)
        next unless File.directory?(base_path)

        Dir.foreach(base_path) do |entry|
          next if entry == '.' || entry == '..' || entry == '.DS_Store'

          full_path = File.join(base_path, entry)
          next unless File.directory?(full_path)

          # Find all images
          images = []
          Dir.foreach(full_path) do |file|
            next if file == '.' || file == '..' || file == '.DS_Store'
            if image_extensions.include?(File.extname(file).downcase)
              images << File.join(dir, entry, file)
            end
          end
          images.sort!
          all_image_count = images.length
          images = images.take(10)

          # Parse frontmatter from index.html
          index_path = File.join(full_path, 'index.html')
          tags = []
          image_tags = {}
          gallery_directory = entry
          if File.exist?(index_path)
            content = File.read(index_path)
            if content =~ /\A---\s*\n(.*?\n?)^---\s*$/m
              begin
                frontmatter = YAML.safe_load($1, permitted_classes: [Date]) || {}
                tags = frontmatter['tags'] || []
                gallery_directory = frontmatter['gallery-directory'] || entry
                raw_image_tags = frontmatter['image_tags'] || {}
                raw_image_tags.each do |filename, img_tags|
                  next unless img_tags.is_a?(Array)
                  image_tags[filename] = img_tags
                  img_tags.each { |t| screenshot_tag_counts[t] += 1 }
                end
              rescue => e
                # Skip malformed frontmatter
              end
            end
          end

          # Fallback: read tags.json if image_tags is empty
          if image_tags.empty?
            tags_json_path = File.join(full_path, 'tags.json')
            if File.exist?(tags_json_path)
              begin
                json_tags = JSON.parse(File.read(tags_json_path))
                json_tags.each do |filename, img_tags|
                  next unless img_tags.is_a?(Array)
                  image_tags[filename] = img_tags
                  img_tags.each { |t| screenshot_tag_counts[t] += 1 }
                end
              rescue => e
                # Skip malformed tags.json
              end
            end
          end

          tags.each { |tag| tag_counts[tag] += 1 }

          product_data = {
            'name' => gallery_directory,
            'platform' => dir,
            'path' => File.join(dir, entry),
            'tags' => tags,
            'images' => images,
            'image_count' => all_image_count,
            'gallery_url' => "/#{dir}/#{entry}/"
          }
          product_data['image_tags'] = image_tags unless image_tags.empty?

          products << product_data
        end
      end

      products.sort_by! { |p| p['name'].downcase }

      # Sort tags by count descending
      sorted_tags = tag_counts.sort_by { |_, count| -count }.to_h
      sorted_screenshot_tags = screenshot_tag_counts.sort_by { |_, count| -count }.to_h

      base_url = site.config['url'] || ''
      base_path = site.config['baseurl'] || ''

      data = {
        'generated_at' => Time.now.utc.iso8601,
        'base_url' => "#{base_url}#{base_path}",
        'products' => products,
        'tags' => sorted_tags,
        'screenshot_tags' => sorted_screenshot_tags
      }

      # Write the JSON file
      dir = 'api'
      FileUtils.mkdir_p(File.join(site.dest, dir))

      page = PageWithoutAFile.new(site, site.source, dir, 'products.json')
      page.content = JSON.generate(data)
      page.data['layout'] = nil
      site.pages << page
    end
  end
end
