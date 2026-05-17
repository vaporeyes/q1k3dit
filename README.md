# Q1K3DIT

A browser based block level editor for the Q1K3 JavaScript engine in `~/dev/repos/q1k3`.

## Use

Open `index.html` in a browser.

- `S`: select brushes or entities
- `B`: drag to place a brush on the current layer
- `X`: erase brushes or entities
- `E`: place the selected entity type
- `Delete` or `Backspace`: delete the selected brush or entity
- Right mouse drag or option drag: orbit the 3D camera
- Middle mouse drag: pan the viewport
- Mouse wheel: zoom the 3D camera
- Layer controls edit the Q1K3 vertical grid, where one layer is 16 engine units
- Placement height controls how tall newly dragged brushes are
- View controls reset, focus, or switch the 3D camera
- Lighting controls preview ambient and sun direction and add Q1K3 light entities

## Engine Fit

Q1K3 uses axis aligned block maps after packing:

- X and Z grid cells are 32 engine units
- Y grid cells are 16 engine units
- `.map` export writes Quake map coordinates for `pack_map.c`
- `.plb` export writes the packed block and entity format consumed by `source/map.js`

## Play In Q1K3

Use the included tooling from this directory:

```sh
make add-map MAP=/path/to/q1k3dit.map NAME=my_map BUILD=1
make serve
```

Then open:

```text
http://127.0.0.1:8000/build/index.html
```

`add-map` copies the map into `/Users/jsh/dev/repos/q1k3/assets/maps`, regenerates the map packing section of Q1K3 `build.sh`, and updates Q1K3's runtime map count in `source/game.js`.

Useful commands:

```sh
make add-map MAP=/path/to/q1k3dit.map NAME=my_map
make sync-maps BUILD=1
make serve PORT=8001
make serve-build
```

The underlying CLI is:

```sh
uv run python tools/q1k3dit.py add-map /path/to/q1k3dit.map --name my_map --build
uv run python tools/q1k3dit.py serve --port 8000
```

The importer only edits axis aligned brushes. More complex TrenchBroom brushes are counted as skipped instead of being converted incorrectly.
