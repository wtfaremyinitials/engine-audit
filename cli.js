#!/usr/bin/env node
const path = require('path')
const fs = require('mz/fs')
const logSymbols = require('log-symbols')
const semver = require('semver')
const semverIntersect = require('semver-set').intersect
const glob = require('globby')
const meow = require('meow')
const ol = require('one-liner')
const featuresUsed = require('js-features-used')

const cli = meow(
    `
    Usage
      $ engine-audit [ files glob ]

    Options
      $ --ignore='<glob>', -i='<glob>' A glob of files to ignore
      $ --verbose, -v                  Verbose output mode

    Examples
      $ engine-audit                # Check all .js files
      $ engine-audit 'dist/**/*.js' # Check only compiled .js files
      $ engine-audit -i='{**/test.js,**/*.test.js}' # Ignore tests
`,
    {
        alias: {
            i: 'ignore',
            v: 'verbose',
        },
    }
)

const includeGlob = cli.input[0] || '**/*.js'
const ignoreGlob = cli.flags.ignore || ''
const verbose = !!cli.flags.verbose

async function main() {
    const cwd = process.cwd()
    const pkg = require(path.resolve(cwd, 'package.json'))
    const engines = pkg.engines

    if (!engines) {
        console.log(`${logSymbols.error} No engines field in package.json`)
        process.exit(2)
    }

    const engine = engines.node

    if (!engine) {
        console.log(`${logSymbols.error} No node property of engines field`)
        process.exit(2)
    }

    if (!semver.validRange(engine)) {
        console.log(
            `${logSymbols.error} '${engine}' is not a valid semver range`
        )
    }

    const includePaths = await glob(includeGlob)
    const ignorePaths = await glob(ignoreGlob)

    const paths = includePaths
        .filter(p => !p.startsWith('node_modules'))
        .filter(p => ignorePaths.indexOf(p) == -1)

    if (verbose) {
        console.log('checking: ' + paths)
    }

    let compatible = true

    for (const file of paths) {
        const code = (await fs.readFile(file)).toString()
        const features = featuresUsed(code)

        for (const feature of features) {
            // does the `engine` range intersect with anything below
            // the feature's required version?
            const version = feature.requiredVersion
            const incompatibleWith = '<' + version
            if (semverIntersect(engine, incompatibleWith) != null) {
                compatible = false

                console.log(
                    ol(
                        `${logSymbols.error} ${'./' +
                            file} uses ${feature.name} which is
                         not supported on all versions in the range ${engine}`
                    )
                )
                console.log(
                    ol(`
                        Remove the use of ${feature.name} or change the engine field to ${'>=' +
                        version}
                    `)
                )
            }
        }
    }

    if (compatible) {
        console.log(`${logSymbols.success} No engine incompatibilities found`)
    }

    process.exit(compatible ? 0 : 2)
}

main()
