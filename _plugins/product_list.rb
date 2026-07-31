module Jekyll
  class ProductListGenerator < Generator
    safe true

    def generate(site)
      product_folders = []
      
      # Directories to scan — the platform taxonomy, from _config.yml.
      dirs_to_scan = Jekyll::Platforms.for(site)
      
      # Valid image extensions
      image_extensions = ['.png', '.jpg', '.jpeg', '.gif']

      dirs_to_scan.each do |dir|
        base_path = File.join(site.source, dir)
        
        if File.directory?(base_path)
          Dir.foreach(base_path) do |entry|
            # Skip . and .. and .DS_Store
            next if entry == '.' || entry == '..' || entry == '.DS_Store'
            
            full_path = File.join(base_path, entry)
            # Check if it's a directory
            if File.directory?(full_path)
              # A folder without index.html has no page to link to — Jekyll
              # renders nothing for it, so a card here would be a dead link.
              # Dropping screenshots in before writing the frontmatter is a
              # normal in-progress state, so skip quietly rather than fail.
              next unless File.exist?(File.join(full_path, 'index.html'))

              # Find first 4 images
              images = []
              Dir.foreach(full_path) do |file|
                next if file == '.' || file == '..' || file == '.DS_Store'
                if image_extensions.include?(File.extname(file).downcase)
                  images << File.join(dir, entry, file)
                end
              end
              
              # Sort images to ensure consistent order (e.g. by filename) and take top 4
              images.sort!
              top_images = images.take(4)

              # Data for the product
              product_folders << {
                "name" => entry,
                "category" => dir,
                "path" => File.join(dir, entry),
                "images" => top_images,
                "total_images" => images.length
              }
            end
          end
        end
      end
      
      # Sort alphabetically, with category breaking name ties so the order
      # doesn't depend on the order `platforms:` lists them (sort_by isn't
      # stable, and some products exist on more than one platform).
      product_folders.sort_by! { |item| [item["name"].downcase, item["category"]] }
      
      # Expose to Liquid
      site.data['product_folders'] = product_folders
    end
  end
end
