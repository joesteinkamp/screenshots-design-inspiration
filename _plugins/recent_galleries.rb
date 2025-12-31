module Jekyll
  class RecentGalleriesGenerator < Generator
    safe true
    priority :low

    def generate(site)
      # Directories to scan for galleries
      gallery_roots = ['Web', 'Mobile', 'Email']
      
      galleries = []

      gallery_roots.each do |root|
        root_path = File.join(site.source, root)
        next unless File.directory?(root_path)

        Dir.foreach(root_path) do |gallery_dir|
          next if gallery_dir == '.' || gallery_dir == '..' || gallery_dir == '.DS_Store'
          
          gallery_path = File.join(root_path, gallery_dir)
          next unless File.directory?(gallery_path)

          # Find the latest modification time in this gallery
          # defaulting to 0
          latest_mtime = Time.at(0)
          
          # Try to get the last commit date for this directory using git
          # This is more reliable in CI/CD where file mtimes are reset on checkout
          begin
            # %ct is committer date, UNIX timestamp
            # We use the relative path for git command
            relative_gallery_path = File.join(root, gallery_dir) 
            git_log = `git log -1 --format="%ct" -- "#{gallery_path}"`.strip
            
            if !git_log.empty?
              latest_mtime = Time.at(git_log.to_i)
            else
              # Fallback to filesystem mtime if git returns nothing (e.g. new untracked files)
               Dir.glob(File.join(gallery_path, "*")) do |file|
                 next if File.directory?(file)
                 mtime = File.mtime(file)
                 latest_mtime = mtime if mtime > latest_mtime
               end
            end
          rescue
             # Fallback if git command fails completely
             Dir.glob(File.join(gallery_path, "*")) do |file|
               next if File.directory?(file)
               mtime = File.mtime(file)
               latest_mtime = mtime if mtime > latest_mtime
             end
          end

          if latest_mtime > Time.at(0)
            galleries << {
              "name" => gallery_dir,
              "category" => root,
              "url" => File.join(root, gallery_dir, "/"),
              "date" => latest_mtime
            }
          end
        end
      end

      # Sort by date descending
      galleries.sort_by! { |g| g["date"] }.reverse!

      # Inject into site.data
      site.data['recent_galleries'] = galleries.take(8)
    end
  end
end
