# esmBot image natives

This folder is a copy of the image processing parts of
[esmBot](https://github.com/esmBot/esmBot) by TheEssem, used by zekbot420's
`/image` command. esmBot is released under the MIT License; see [LICENSE](LICENSE).

Copied from upstream commit `cde2dd9ced04cf01b0ed1e73a6e36fe0d4b70a7f`
(version 2026.10.0, see package.json):

- `natives/` — the C++ image effects (built on libvips)
- `CMakeLists.txt` — the build file. zekbot420 turns `WITH_ZXING` and
  `WITH_BACKWARD` off by default (no qr command, no download at build time)
- `assets/fonts`, `assets/images` — fonts and overlay images the effects use.
  The region flag images (a separate git submodule) aren't included, so the
  `flag` effect isn't available.

Nothing else from esmBot is included. The command definitions zekbot420 uses
are in `../esmbotMedia.js`, adapted from `commands/image-editing` in esmBot.

## Building

Install libvips (with C++ headers), fontconfig, pkg-config, CMake and a C++
compiler, then from the zekbot420 folder:

```sh
npm run build:esmbot
```

On macOS with Homebrew, point pkg-config at libarchive first (vips needs it,
and Homebrew keeps it out of the default path):

```sh
PKG_CONFIG_PATH="$(brew --prefix libarchive)/lib/pkgconfig" npm run build:esmbot
```

That creates `esmBot/build/Release/esmbmedia.node`, which `/image` loads.
