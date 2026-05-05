//@ts-check

'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require("copy-webpack-plugin");

//@ts-check
/** @typedef {import('webpack').Configuration} WebpackConfig **/

const buildFolder = path.resolve(__dirname, 'dist');

/** @type WebpackConfig */
const extensionConfig = {
    target: 'node', // VS Code extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/
    mode: 'none', // this leaves the source code as close as possible to the original (when packaging we set this to 'production')

    entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
    output: {
        // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
        path: buildFolder,
        filename: 'extension.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        vscode: 'commonjs vscode' // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
        // modules added here also need to be added in the .vscodeignore file
    },
    resolve: {
        // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
        extensions: ['.ts', '.js', '.node'],
        alias: {
            'node-gyp-build$': path.resolve(__dirname, 'src/native/nodeGypBuildShim.js'),
        },
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader'
                    }
                ]
            },
            {
                test: /\.node$/,
                use: [
                    {
                        loader: 'node-loader'
                    }
                ]
            },
            {
                test: /\.wasm$/,
                use: [
                  'wasm-loader'
                ]
            }
        ]
    },
    plugins: [
        new CopyPlugin({
            patterns: [
              { from: "node_modules/web-tree-sitter/web-tree-sitter.wasm", to: buildFolder },
              { from: "resources/tree-sitter-c.wasm", to: buildFolder }
            ],
          }),
        new webpack.IgnorePlugin({
            resourceRegExp: /build\/Debug\/tree_sitter(_c)?_binding$/,
        }),
        new webpack.IgnorePlugin({
            resourceRegExp: /^\.\/prebuilds$/,
            contextRegExp: /node_modules[\\/]tree-sitter$/,
        }),
    ],
    ignoreWarnings: [
        {
            module: /tree-sitter-c[\\/]bindings[\\/]node[\\/]index\.js$/,
            message: /Can't resolve '\.\.\/\.\.\/build\/Debug\/tree_sitter_c_binding'/,
        },
        {
            module: /tree-sitter[\\/]index\.js$/,
            message: /Can't resolve '\.\/build\/Debug\/tree_sitter_runtime_binding'/,
        },
    ],
    devtool: 'nosources-source-map',
    infrastructureLogging: {
        level: "log", // enables logging required for problem matchers
    },
};
module.exports = [extensionConfig];
