# Ulugo

<p align="center">
  <img src="/apps/web/src/assets/logo-512.webp" alt="Ulugo logo"/><br>
  <img src="/apps/web/src/assets/wulu-512.webp"/>
</p>

Ulugo is an SGF editor and AI review tool for Go/Weiqi. It runs as a web app and as an Electron desktop app that can manage KataGo analysis locally.

## Features

- Open, edit, and save SGF game records.
- Import common Go record formats, including SGF and Tygem GIB.
- Edit game information, comments, move branches, labels, and board markup.
- Review games with KataGo analysis in the Electron app.
- Download or select KataGo binaries and neural network models from the app.
- Open from and save to Google Drive.

## Development

Start web server

```sh
pnpm install
pnpm dev
```

Start electron app

```sh
pnpm install
pnpm dev:electron
```

## Acknowledgements

This project is inspired by [KaTrain](https://github.com/sanderland/katrain), [Sabaki](https://github.com/SabakiHQ/Sabaki), and [KataGo](https://github.com/lightvector/KataGo). It would not have been possible without their excellent work.
