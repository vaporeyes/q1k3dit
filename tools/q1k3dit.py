# ABOUTME: Provides Q1K3DIT commands for adding maps to Q1K3 and serving the game.
# ABOUTME: Rewrites only Q1K3 map build entries and the runtime map count.
from __future__ import annotations

import argparse
import http.server
import re
import shutil
import socketserver
import subprocess
from pathlib import Path


DEFAULT_Q1K3_DIR = Path("~/dev/repos/q1k3").expanduser()


def main() -> None:
    parser = argparse.ArgumentParser(prog="q1k3dit")
    parser.add_argument(
        "--q1k3-dir",
        type=Path,
        default=DEFAULT_Q1K3_DIR,
        help="Path to the Q1K3 repository.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    add_map_parser = subparsers.add_parser("add-map", help="Copy a .map into Q1K3 and sync map build entries.")
    add_map_parser.add_argument("map_file", type=Path, help="Exported .map file to add.")
    add_map_parser.add_argument("--name", help="Map filename stem to use in Q1K3 assets/maps.")
    add_map_parser.add_argument("--build", action="store_true", help="Run Q1K3 build.sh after syncing maps.")

    sync_parser = subparsers.add_parser("sync-maps", help="Regenerate build.sh map entries from assets/maps.")
    sync_parser.add_argument("--build", action="store_true", help="Run Q1K3 build.sh after syncing maps.")

    serve_parser = subparsers.add_parser("serve", help="Serve Q1K3 over local HTTP.")
    serve_parser.add_argument("--port", type=int, default=8000, help="HTTP port to listen on.")
    serve_parser.add_argument("--bind", default="127.0.0.1", help="Address to bind.")
    serve_parser.add_argument("--build", action="store_true", help="Run Q1K3 build.sh before serving.")

    args = parser.parse_args()
    q1k3_dir = args.q1k3_dir.expanduser().resolve()
    require_q1k3(q1k3_dir)

    if args.command == "add-map":
        add_map(q1k3_dir, args.map_file, args.name)
        sync_maps(q1k3_dir)
        if args.build:
            build(q1k3_dir)
        return

    if args.command == "sync-maps":
        sync_maps(q1k3_dir)
        if args.build:
            build(q1k3_dir)
        return

    if args.command == "serve":
        if args.build:
            build(q1k3_dir)
        serve(q1k3_dir, args.bind, args.port)
        return


def require_q1k3(q1k3_dir: Path) -> None:
    required = [q1k3_dir / "build.sh", q1k3_dir / "pack_map.c", q1k3_dir / "source" / "game.js"]
    missing = [path for path in required if not path.exists()]
    if missing:
        missing_text = ", ".join(str(path) for path in missing)
        raise SystemExit(f"Not a Q1K3 repo or missing required files: {missing_text}")


def add_map(q1k3_dir: Path, source_map: Path, name: str | None) -> None:
    source_map = source_map.expanduser().resolve()
    if source_map.suffix != ".map":
        raise SystemExit("Map file must use the .map extension.")
    if not source_map.exists():
        raise SystemExit(f"Map file does not exist: {source_map}")

    safe_name = map_name(name or source_map.stem)
    destination = q1k3_dir / "assets" / "maps" / f"{safe_name}.map"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source_map, destination)
    print(f"Added {destination}")


def map_name(value: str) -> str:
    name = re.sub(r"[^A-Za-z0-9_\\-]+", "_", value.strip())
    name = name.strip("_-")
    if not name:
        raise SystemExit("Map name must contain at least one letter or number.")
    return name


def sync_maps(q1k3_dir: Path) -> None:
    maps = sorted((q1k3_dir / "assets" / "maps").glob("*.map"), key=lambda path: path.stem)
    if not maps:
        raise SystemExit("No .map files found in Q1K3 assets/maps.")

    build_sh = q1k3_dir / "build.sh"
    build_text = build_sh.read_text()
    build_text = replace_section(
        build_text,
        "# Pack maps\n",
        "\n# Concat all maps into one file\n",
        pack_maps_section(maps),
    )
    build_text = replace_section(
        build_text,
        "# Concat all maps into one file\n",
        "\n# Pack models\n",
        concat_maps_section(maps),
    )
    build_sh.write_text(build_text)

    game_js = q1k3_dir / "source" / "game.js"
    game_text = game_js.read_text()
    game_text_next, replacements = re.subn(
        r"if \(game_map_index == \d+\) \{",
        f"if (game_map_index == {len(maps)}) {{",
        game_text,
        count=1,
    )
    if replacements != 1:
        raise SystemExit("Could not find game_map_index map count in source/game.js.")
    game_js.write_text(game_text_next)

    print(f"Synced {len(maps)} map entries in Q1K3.")


def replace_section(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    start = text.find(start_marker)
    end = text.find(end_marker)
    if start < 0 or end < 0 or end <= start:
        raise SystemExit(f"Could not find section from {start_marker.strip()} to {end_marker.strip()}.")
    return text[: start + len(start_marker)] + replacement + text[end:]


def pack_maps_section(maps: list[Path]) -> str:
    lines = []
    for map_path in maps:
        lines.append(f"./pack_map assets/maps/{map_path.name} build/{map_path.stem}.plb")
    return "\n".join(lines) + "\n"


def concat_maps_section(maps: list[Path]) -> str:
    lines = ["cat \\"]
    for map_path in maps:
        lines.append(f"\tbuild/{map_path.stem}.plb \\")
    lines.append("\t> build/l")
    return "\n".join(lines) + "\n"


def build(q1k3_dir: Path) -> None:
    subprocess.run(["./build.sh"], cwd=q1k3_dir, check=True)


def serve(q1k3_dir: Path, bind: str, port: int) -> None:
    build_index = q1k3_dir / "build" / "index.html"
    if not build_index.exists():
        print("build/index.html does not exist yet. Run add-map --build, sync-maps --build, or build Q1K3 first.")
    print(f"Serving Q1K3 at http://{bind}:{port}/build/index.html")
    handler = http.server.SimpleHTTPRequestHandler
    server_type = reusable_tcp_server()
    with server_type((bind, port), handler) as server:
        with chdir(q1k3_dir):
            server.serve_forever()


def reusable_tcp_server() -> type[socketserver.TCPServer]:
    class ReusableTcpServer(socketserver.TCPServer):
        allow_reuse_address = True

    return ReusableTcpServer


class chdir:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.previous = Path.cwd()

    def __enter__(self) -> None:
        import os

        os.chdir(self.path)

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        import os

        os.chdir(self.previous)


if __name__ == "__main__":
    main()
