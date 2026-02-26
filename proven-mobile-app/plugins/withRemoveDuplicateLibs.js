/**
 * Config plugin to fix duplicate library linker warnings
 * This adds a post_install hook to the Podfile that removes duplicate -lc++ flags
 */

const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withRemoveDuplicateLibs(config) {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

            if (fs.existsSync(podfilePath)) {
                let podfileContent = fs.readFileSync(podfilePath, 'utf8');

                // Check if we've already added the fix
                if (!podfileContent.includes('Remove duplicate -lc++')) {
                    // Add post_install hook to remove duplicate library flags
                    const postInstallHook = `
  # Remove duplicate -lc++ linker flag warnings
  post_install do |installer|
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        ldflags = config.build_settings['OTHER_LDFLAGS'] || []
        if ldflags.is_a?(Array)
          ldflags = ldflags.uniq
          config.build_settings['OTHER_LDFLAGS'] = ldflags
        end
      end
    end
  end
`;

                    // Insert before the last 'end' in the Podfile
                    const endIndex = podfileContent.lastIndexOf('end');
                    if (endIndex !== -1) {
                        podfileContent = podfileContent.slice(0, endIndex) + postInstallHook + podfileContent.slice(endIndex);
                        fs.writeFileSync(podfilePath, podfileContent);
                    }
                }
            }

            return config;
        },
    ]);
}

module.exports = withRemoveDuplicateLibs;
