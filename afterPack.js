const path = require('path')
const { rcedit } = require('rcedit')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exe = path.join(
    context.appOutDir,
    context.packager.appInfo.productName + '.exe'
  )

  await rcedit(exe, {
    icon: path.join(__dirname, 'build', 'Pulsar.ico'),
    'file-version': context.packager.appInfo.version,
    'product-version': context.packager.appInfo.version,
    'version-string': {
      FileDescription: context.packager.appInfo.productName,
      ProductName: context.packager.appInfo.productName,
      CompanyName: context.packager.appInfo.companyName || context.packager.appInfo.productName,
    },
  })
}
