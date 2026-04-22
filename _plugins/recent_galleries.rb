require 'open3'

module Jekyll
  class RecentGalleriesGenerator < Generator
    safe true
    priority :low

    GALLERY_ROOTS = ['Web', 'Mobile', 'Email']

    def generate(site)
      started_at = Time.now
      Jekyll.logger.info('RecentGalleries:', 'reading git log for gallery mtimes...')
      # One git log covers every gallery; spawning git per directory turns a
      # few-hundred-gallery repo into a 50+ minute build.
      latest_by_gallery = gallery_commit_times(site.source)
      Jekyll.logger.info(
        'RecentGalleries:',
        "git log returned #{latest_by_gallery.size} gallery entries in #{format('%.2fs', Time.now - started_at)}"
      )

      galleries = []

      GALLERY_ROOTS.each do |root|
        root_path = File.join(site.source, root)
        next unless File.directory?(root_path)

        Dir.foreach(root_path) do |gallery_dir|
          next if gallery_dir == '.' || gallery_dir == '..' || gallery_dir == '.DS_Store'

          gallery_path = File.join(root_path, gallery_dir)
          next unless File.directory?(gallery_path)

          latest_mtime = latest_by_gallery["#{root}/#{gallery_dir}"]

          if latest_mtime.nil?
            latest_mtime = Time.at(0)
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

      galleries.sort_by! { |g| g["date"] }.reverse!
      site.data['recent_galleries'] = galleries.take(8)
      Jekyll.logger.info(
        'RecentGalleries:',
        "ranked #{galleries.size} galleries in #{format('%.2fs', Time.now - started_at)}"
      )
    end

    private

    def gallery_commit_times(source)
      result = {}
      output, status = Open3.capture2(
        'git', '-C', source, 'log', '--name-only',
        '--pretty=format:COMMIT %ct', '--', *GALLERY_ROOTS
      )
      return result unless status.success?

      current_time = nil
      output.each_line do |line|
        line = line.chomp
        if line.start_with?('COMMIT ')
          current_time = Time.at(line[7..].to_i)
        elsif !line.empty? && current_time
          parts = line.split('/', 3)
          next unless parts.length >= 2 && GALLERY_ROOTS.include?(parts[0])
          # Log is reverse-chronological; first hit per gallery is latest.
          result["#{parts[0]}/#{parts[1]}"] ||= current_time
        end
      end
      result
    rescue StandardError
      {}
    end
  end
end
