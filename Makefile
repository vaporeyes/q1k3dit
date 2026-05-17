# ABOUTME: Convenience targets for using Q1K3DIT tooling from the project root.
# ABOUTME: Wraps the Python CLI with uv so map sync and serving are one command.
Q1K3_DIR ?= /Users/jsh/dev/repos/q1k3
PORT ?= 8000

.PHONY: add-map sync-maps serve serve-build

add-map:
	@test -n "$(MAP)" || (echo "Usage: make add-map MAP=/path/to/map.map [NAME=map_name] [BUILD=1]" && exit 1)
	uv run python tools/q1k3dit.py --q1k3-dir "$(Q1K3_DIR)" add-map "$(MAP)" $(if $(NAME),--name "$(NAME)",) $(if $(BUILD),--build,)

sync-maps:
	uv run python tools/q1k3dit.py --q1k3-dir "$(Q1K3_DIR)" sync-maps $(if $(BUILD),--build,)

serve:
	uv run python tools/q1k3dit.py --q1k3-dir "$(Q1K3_DIR)" serve --port "$(PORT)"

serve-build:
	uv run python tools/q1k3dit.py --q1k3-dir "$(Q1K3_DIR)" serve --port "$(PORT)" --build
