import esbuild from "esbuild";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";
import { spawn, spawnSync } from "child_process";

const releaseBuild = process.env.BUILD === 'true'
const targets = (process.env.TARGETS || '').split(',')
const buildDir = releaseBuild ? 'dist' : 'build'

if (targets.length === 0) {
    throw new Error('TARGETS is not defined')
}

const buildExtension = targets.some(t => t === 'extension') || releaseBuild

const baseOptions = {
    bundle: true,
    loader: {
        ".ts": "tsx",
        ".tsx": "tsx",
        ".woff2": "file",
        ".woff": "file",
        ".html": "copy",
        ".json": "copy",
        ".ico": "copy",
    },
    plugins: [
        NodeModulesPolyfillPlugin(),
    ],
    minify: releaseBuild,
    // sourcemap: 'external',
    sourcemap: 'linked',
    define: {
        "global": "window",
        "process.env.PRODUCTION": releaseBuild ? '"true"' : '"false"'
    },
    entryNames: "[name]",
    logLevel: 'info',
}

const runTailwindBuild = (target, watch, outfile) => {
    console.log(`[${target}] building Tailwind CSS...`);
    try {
        const command = 'npx';
        const args = [
            'tailwindcss',
            'build',
            '-i', 'src/tailwind.css',
            '-o', outfile
        ];

        if (watch) {
            args.push('--watch')
            spawn(command, args, {
                stdio: 'inherit'
            })
        } else {
            spawnSync(command, args, {
                stdio: 'inherit'
            });
        }
        console.log(`[${target}] CSS build successful!`);
    } catch (error) {
        console.error("Error building Tailwind CSS:", error.message);
    }
};

async function doBuild(target, options, port) {
    runTailwindBuild(target, !releaseBuild, `${options.outdir}/tailwind.css`);

    if (releaseBuild) {
        await esbuild.build(options);
    } else {
        try {
            const context = await esbuild
                .context(options);

            await context.rebuild()
            if (port !== undefined) {
                console.log('serving', options.outdir)
                context.serve({
                    port: port,
                    servedir: options.outdir,
                    fallback: `${buildDir}/site/index.html`,
                    onRequest: args => {
                        console.log(args.method, args.path)
                    }
                })
            }
            await context.watch()
        } catch (e) {
            console.error('failed to build: ' + e)
        }
    }
}

await Promise.all([
    buildExtension && doBuild('extension', {
        ...baseOptions,
        entryPoints: [
            "./src/tab.tsx",
            "./src/options.tsx",
            "./src/background.tsx",
            "./src/options.html",
            "./src/tab.html",
            "./src/manifest.json",
        ],
        outdir: `${buildDir}/extension/`,
    })
])