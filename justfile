default:
    @just --list

install:
    npm install

sync-core:
    npm run sync-core

dev:
    npm run dev

build:
    npm run build

preview:
    npm run preview

test:
    npm test

typecheck:
    npm run typecheck

format:
    npm run format

format-check:
    npm run format:check

check: typecheck test format-check

verify: check build

clean:
    rm -rf dist
    rm -f public/uniplanner-core.js
