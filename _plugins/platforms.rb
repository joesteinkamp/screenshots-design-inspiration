# Shared access to the platform taxonomy defined in _config.yml.
#
# A platform is a top-level content directory (`<Platform>/<Product>/index.html`),
# so this list doubles as "which directories hold galleries". Every generator,
# template and script reads it from one place; see the `platforms:` key in
# _config.yml.
#
# Missing or malformed config raises rather than defaulting. An empty platform
# list would build a structurally valid but completely empty site, which is a
# far worse failure than a loud one.

module Jekyll
  module Platforms
    class ConfigError < StandardError; end

    def self.for(site)
      raw = site.config['platforms']

      unless raw.is_a?(Array) && !raw.empty?
        raise ConfigError, "_config.yml `platforms:` must be a non-empty list of " \
                           "directory names (got #{raw.inspect})"
      end

      raw.map do |name|
        unless name.is_a?(String) && !name.strip.empty?
          raise ConfigError, "_config.yml `platforms:` entries must be non-empty " \
                             "strings (got #{name.inspect})"
        end
        name
      end
    end

    # The platform a repo-relative path belongs to, or nil if it isn't inside one.
    #
    # Matches on the first path segment, never a substring: product folders like
    # "Universal Studios" or "T-Mobile" contain platform names as substrings, and
    # substring matching would file them under the wrong platform.
    def self.from_path(site, path)
      segments = path.to_s.sub(%r{\A/}, '').split('/')
      return nil if segments.empty?

      root = segments.first
      self.for(site).include?(root) ? root : nil
    end
  end
end
