module Jekyll
  class ProductListGenerator < Generator
    safe true

    def generate(site)
      product_folders = []
      
      # Directories to scan
      dirs_to_scan = ['Mobile', 'Web', 'Email']
      
      dirs_to_scan.each do |dir|
        base_path = File.join(site.source, dir)
        
        if File.directory?(base_path)
          Dir.foreach(base_path) do |entry|
            # Skip . and .. and .DS_Store
            next if entry == '.' || entry == '..' || entry == '.DS_Store'
            
            # Check if it's a directory
            if File.directory?(File.join(base_path, entry))
              product_folders << {
                "name" => entry,
                "category" => dir,
                "path" => File.join(dir, entry)
              }
            end
          end
        end
      end
      
      # Sort alphabetically
      product_folders.sort_by! { |item| item["name"].downcase }
      
      # Expose to Liquid
      site.data['product_folders'] = product_folders
    end
  end
end
