#!/usr/bin/env node
const path = require('path')
const fs = require('mz/fs')
const logSymbols = require('log-symbols')
const semver = require('semver')
const semverIntersect = require('semver-set').intersect
const glob = require('glob-promise')
const meow = require('meow')
const ol = require('one-liner')
const featuresUsed = require('js-features-used')

const cli = meow(
    `
    Usage
      $ engine-audit

    Examples
      $ engine-audit                # Check all .js files
      $ engine-audit 'dist/**/*.js' # Check only compiled .js files
`
)

const userGlob = cli.input[0] || '**/*.js'

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

    const paths = (await glob(userGlob)).filter(
        p => !p.startsWith('node_modules')
    )

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
        console.log(`${logSymbols.success} No incompatibilities found`)
    }

    process.exit(compatible ? 0 : 2)
}

main()
