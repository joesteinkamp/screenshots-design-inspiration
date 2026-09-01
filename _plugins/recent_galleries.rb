require 'open3'

module Jekyll
  class RecentGalleriesGenerator < Generator
    safe true
    priority :low

    # Commits whose subject carries this marker are ignored when dating a
    # gallery. A bulk reorganization (renaming a platform directory, say)
    # touches every gallery in one commit, which would otherwise make all of
    # them look brand new and wipe out the real recency signal.
    SKIP_MARKER = '[skip-recency]'.freeze

    # Roots galleries used to live under, mapped to the roots they were split
    # into. `git log -- iOS` cannot see a gallery's history from while it sat
    # at `Mobile/<Product>/`, and the single commit that does name the new path
    # is the rename itself — which carries SKIP_MARKER and so is deliberately
    # invisible here. Without this map every ex-Mobile gallery comes back
    # undated. Add an entry whenever a root is renamed.
    HISTORICAL_ROOTS = { 'Mobile' => %w[iOS Android] }.freeze

    def generate(site)
      started_at = Time.now
      gallery_roots = Jekyll::Platforms.for(site)
      gallery_keys = existing_galleries(site.source, gallery_roots)

      Jekyll.logger.info('RecentGalleries:', 'reading git log for gallery mtimes...')
      # One git log covers every gallery; spawning git per directory turns a
      # few-hundred-gallery repo into a 50+ minute build.
      latest_by_gallery = gallery_commit_times(site.source, gallery_roots, gallery_keys)
      Jekyll.logger.info(
        'RecentGalleries:',
        "git log returned #{latest_by_gallery ? latest_by_gallery.size : 0} gallery entries " \
        "in #{format('%.2fs', Time.now - started_at)}"
      )

      galleries = []
      undated = []

      gallery_keys.each do |key|
        root, gallery_dir = key.split('/', 2)
        latest_mtime = latest_by_gallery && latest_by_gallery[key]

        # File mtimes are only meaningful outside a git checkout — in CI every
        # file carries the moment `actions/checkout` wrote it, so any gallery
        # git could not date sorted to the top as if it had been added today.
        # That is how the ex-Mobile galleries once took over the whole list.
        # So only fall back when git told us nothing at all (no repo, no git
        # binary). A gallery that git simply has no commit for is left out
        # rather than given an invented date.
        if latest_mtime.nil? && latest_by_gallery.nil?
          latest_mtime = newest_file_mtime(File.join(site.source, key))
        end

        if latest_mtime.nil?
          undated << key
          next
        end

        next unless latest_mtime > Time.at(0)

        galleries << {
          "name" => gallery_dir,
          "category" => root,
          "url" => File.join(root, gallery_dir, "/"),
          "date" => latest_mtime
        }
      end

      unless undated.empty?
        # Loud on purpose. An undated gallery means the git history for it is
        # unreachable from its current path — the symptom is a silently stale
        # "Recently Added", which is easy to miss for weeks.
        Jekyll.logger.warn(
          'RecentGalleries:',
          "#{undated.size} galleries have no reachable commit and were left out of " \
          "Recently Added (e.g. #{undated.take(3).join(', ')}). If a platform root was " \
          "renamed, add it to HISTORICAL_ROOTS in _plugins/recent_galleries.rb."
        )
      end

      # Newest first, with category and name breaking date ties. A commit that
      # adds several galleries at once gives them all the same timestamp, and
      # sort_by isn't stable — without the tiebreak the "Recently Added" list
      # reshuffles between builds of identical content. Negating the date rather
      # than reversing keeps ties in ascending name order.
      galleries.sort_by! { |g| [-g["date"].to_f, g["category"], g["name"].downcase] }
      site.data['recent_galleries'] = galleries.take(8)
      Jekyll.logger.info(
        'RecentGalleries:',
        "ranked #{galleries.size} galleries in #{format('%.2fs', Time.now - started_at)}"
      )
    end

    private

    # "<Root>/<Product>" for every gallery directory currently on disk.
    def existing_galleries(source, gallery_roots)
      gallery_roots.flat_map do |root|
        root_path = File.join(source, root)
        next [] unless File.directory?(root_path)

        # No filter_map here — CI pins Ruby 2.6 and it landed in 2.7.
        Dir.children(root_path).sort.map do |gallery_dir|
          next if gallery_dir.start_with?('.')
          next unless File.directory?(File.join(root_path, gallery_dir))

          "#{root}/#{gallery_dir}"
        end.compact
      end
    end

    def newest_file_mtime(gallery_path)
      newest = Time.at(0)
      Dir.glob(File.join(gallery_path, "*")) do |file|
        next if File.directory?(file)
        mtime = File.mtime(file)
        newest = mtime if mtime > newest
      end
      newest
    end

    # Returns "<Root>/<Product>" => Time of its newest non-SKIP_MARKER commit,
    # or nil if git could not be consulted at all.
    def gallery_commit_times(source, gallery_roots, gallery_keys)
      result = {}
      # Historical roots are logged too, then translated below, so a gallery
      # keeps the history it accumulated under its old path.
      search_roots = gallery_roots + HISTORICAL_ROOTS.keys
      output, status = Open3.capture2(
        'git', '-C', source, 'log', '--name-only',
        '--pretty=format:COMMIT %ct',
        # Bulk reorganizations opt out of dating galleries; see SKIP_MARKER.
        '--invert-grep', '--fixed-strings', "--grep=#{SKIP_MARKER}",
        '--', *search_roots
      )
      return nil unless status.success?

      successors = successor_index(gallery_keys)
      current_time = nil
      output.each_line do |line|
        line = line.chomp
        if line.start_with?('COMMIT ')
          current_time = Time.at(line[7..].to_i)
        elsif !line.empty? && current_time
          parts = line.split('/', 3)
          next unless parts.length >= 2

          # Log is reverse-chronological; first hit per gallery is latest.
          keys_for(parts[0], parts[1], gallery_roots, successors).each do |key|
            result[key] ||= current_time
          end
        end
      end
      result
    rescue StandardError => e
      Jekyll.logger.warn('RecentGalleries:', "could not read git log (#{e.class}: #{e.message})")
      nil
    end

    # Product name => the current gallery keys under any successor root. A
    # product that exists under more than one successor today (an app shipped
    # on both iOS and Android) cannot be attributed to one of them from the
    # path alone, so both inherit the pre-split history — over-attributing an
    # old date is harmless; leaving one undated is what breaks the list.
    def successor_index(gallery_keys)
      successor_roots = HISTORICAL_ROOTS.values.flatten.uniq
      index = Hash.new { |h, k| h[k] = [] }
      gallery_keys.each do |key|
        root, product = key.split('/', 2)
        index[product] << key if successor_roots.include?(root)
      end
      index
    end

    def keys_for(root, product, gallery_roots, successors)
      return ["#{root}/#{product}"] if gallery_roots.include?(root)
      return [] unless HISTORICAL_ROOTS.key?(root)

      successors[product].select { |key| HISTORICAL_ROOTS[root].include?(key.split('/', 2).first) }
    end
  end
end
