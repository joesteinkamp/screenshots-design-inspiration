# Verbose build progress logging.
#
# This repo has ~400 galleries / ~9k images, so `jekyll build` can go silent
# for several minutes while it reads frontmatter and renders pages. Without
# output, CI looks hung and contributors can't tell whether the build is
# making progress or wedged.
#
# This plugin hooks into Jekyll's lifecycle and emits timestamped progress
# lines for each phase (reset → read → generators → render → write → feed),
# plus a heartbeat every PAGE_HEARTBEAT pages rendered. It deliberately uses
# STDOUT with flushing so GitHub Actions' log streaming shows output in real
# time instead of buffering until the step finishes.

module Jekyll
  module BuildProgress
    PAGE_HEARTBEAT = 50

    class << self
      attr_accessor :phase_started_at, :build_started_at, :page_count, :total_pages

      def log(tag, message)
        elapsed = build_started_at ? format('%7.2fs', Time.now - build_started_at) : '   -   '
        STDOUT.puts "[progress #{elapsed}] #{tag}: #{message}"
        STDOUT.flush
      end

      def mark_phase(name)
        now = Time.now
        if phase_started_at && @phase_name
          log('phase', "finished '#{@phase_name}' in #{format('%.2fs', now - phase_started_at)}")
        end
        @phase_name = name
        @phase_started_at = now
        log('phase', "starting '#{name}'")
      end
    end
  end
end

Jekyll::Hooks.register :site, :after_reset do |site|
  Jekyll::BuildProgress.build_started_at = Time.now
  Jekyll::BuildProgress.page_count = 0
  Jekyll::BuildProgress.total_pages = nil
  Jekyll::BuildProgress.log('site', "source=#{site.source} dest=#{site.dest} env=#{Jekyll.env}")
  # `:after_reset` fires right before site.read, so this phase covers reading
  # every page and static file. On a ~9k-file repo that can easily dominate
  # total build time, so naming it accurately matters.
  Jekyll::BuildProgress.mark_phase('read (scanning source files)')
end

Jekyll::Hooks.register :site, :post_read do |site|
  Jekyll::BuildProgress.log(
    'read',
    "#{site.pages.size} pages, #{site.documents.size} documents, #{site.static_files.size} static files"
  )
  Jekyll::BuildProgress.mark_phase('generators (custom _plugins)')
end

Jekyll::Hooks.register :site, :pre_render do |site, _payload|
  Jekyll::BuildProgress.total_pages = site.pages.size + site.documents.size
  Jekyll::BuildProgress.log('render', "rendering #{Jekyll::BuildProgress.total_pages} pages + documents")
  Jekyll::BuildProgress.mark_phase('render')
end

[:pages, :documents].each do |collection|
  Jekyll::Hooks.register collection, :post_render do |item|
    Jekyll::BuildProgress.page_count += 1
    count = Jekyll::BuildProgress.page_count
    total = Jekyll::BuildProgress.total_pages
    if count % Jekyll::BuildProgress::PAGE_HEARTBEAT == 0
      path = item.respond_to?(:path) ? item.path : item.relative_path
      Jekyll::BuildProgress.log('render', "#{count}/#{total || '?'} rendered (latest: #{path})")
    end
  end
end

Jekyll::Hooks.register :site, :post_render do |site|
  Jekyll::BuildProgress.log('render', "rendered #{Jekyll::BuildProgress.page_count} pages total")
  Jekyll::BuildProgress.mark_phase('write')
end

Jekyll::Hooks.register :site, :post_write do |site|
  Jekyll::BuildProgress.log(
    'write',
    "wrote site to #{site.dest} (#{site.pages.size} pages, #{site.static_files.size} static files)"
  )
  if Jekyll::BuildProgress.build_started_at
    Jekyll::BuildProgress.log(
      'done',
      "total build time #{format('%.2fs', Time.now - Jekyll::BuildProgress.build_started_at)}"
    )
  end
end
