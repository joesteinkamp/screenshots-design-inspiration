module Jekyll
  class GalleryImagesGenerator < Generator
    safe true
    priority :low

    IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.mp4'].freeze

    def generate(site)
      # Group static files by directory once, so gallery layouts don't
      # scan ~10k site.static_files for every gallery page.
      images_by_dir = Hash.new { |h, k| h[k] = [] }
      site.static_files.each do |file|
        ext = File.extname(file.name).downcase
        next unless IMAGE_EXTENSIONS.include?(ext)
        images_by_dir[File.dirname(file.relative_path)] << file
      end

      site.pages.each do |page|
        next unless page.data['layout'] == 'gallery'
        dir = "/#{File.dirname(page.path)}"
        page.data['gallery_images'] = images_by_dir[dir]
      end
    end
  end
end
