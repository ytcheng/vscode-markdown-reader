# Third-party notices

## `@md-reader/theme`

This project includes adapted Less mixins and color tokens from
[`@md-reader/theme`](https://github.com/md-reader/theme), version `2.0.5`,
upstream baseline commit `b99c768a8806e49b11dbe131de26d467034dc0f9`.

The upstream project is licensed under the MIT License. Its complete license
text is distributed at `media/vendor/md-reader-theme/LICENSE`.

Local adaptations scope the theme to `.markdown-body`, add VS Code color-token
fallbacks, TOC layout, responsive drawer behavior, reduced-motion handling,
and High Contrast overrides. No upstream business logic is included.


## V0.2 rendering dependencies

- [Shiki](https://github.com/shikijs/shiki), 4.4.3, MIT: TextMate syntax highlighting. Grammars are bundled and loaded on demand; GitHub Light colors preserve the reader’s light document surface. Shiki and grammar/theme package license files are included under `media/vendor/`.
- [Mermaid](https://github.com/mermaid-js/mermaid), 11.17.2, MIT: bundled diagram renderer. It runs in a sandboxed srcdoc frame without same-origin or network access. The parent allows generated inline styles because srcdoc inherits its CSP; scripts remain restricted to local resources and nonce-authorized code. The reading view displays the result as an inert SVG image. No Mermaid source patches are applied.
- [KaTeX](https://github.com/KaTeX/KaTeX), 0.18.7, MIT: mathematical typesetting, including bundled CSS and fonts. Generated styles are converted to CSS classes and placed in a nonce-authorized stylesheet.
- [@mdit/plugin-tex](https://github.com/mdit-plugins/mdit-plugins), 1.1.1, MIT: Markdown math delimiters. Macro state is scoped to each render.

Dependency license texts are distributed in `media/vendor/`. Runtime dependencies and their versions are recorded in `package-lock.json`.

## Local diagram rendering

- [`@plantuml/core`](https://github.com/plantuml/plantuml), 1.2026.8, MIT: local PlantUML rendering. Its package license is included under `media/vendor/@plantuml/core/`.
- [`@viz-js/viz`](https://github.com/mdaines/viz-js), 3.30.0, MIT: JavaScript API and WebAssembly wrapper for local Graphviz rendering. Its MIT license is included at `media/vendor/@viz-js/viz/Viz.js-MIT.txt`.
- [Graphviz](https://graphviz.org/), 16.0.0, EPL-2.0: Graphviz WebAssembly code included by `@viz-js/viz`. The license text is included at `media/vendor/@viz-js/viz/Graphviz-EPL-2.0.txt`; [the matching Graphviz source archive](https://gitlab.com/api/v4/projects/4207231/packages/generic/graphviz-releases/16.0.0/graphviz-16.0.0.tar.gz) is available from the upstream release service.
- [Expat](https://github.com/libexpat/libexpat), 2.8.4, MIT: XML parser compiled into the Graphviz WebAssembly build. Its license is included at `media/vendor/@viz-js/viz/Expat-MIT.txt`; [the matching Expat source archive](https://github.com/libexpat/libexpat/releases/download/R_2_8_4/expat-2.8.4.tar.gz) is available from upstream.
