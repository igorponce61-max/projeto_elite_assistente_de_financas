#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_PYTHON=""
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:5500"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-60}"

if [[ -n "${PYTHON_BIN:-}" ]]; then
  PYTHON="$PYTHON_BIN"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON="$(command -v python3)"
elif command -v python >/dev/null 2>&1; then
  PYTHON="$(command -v python)"
else
  echo "Erro: Python 3 não foi encontrado. Instale Python 3.10+ e tente novamente." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Erro: curl é necessário para confirmar quando os servidores estiverem prontos." >&2
  exit 1
fi

if [[ -x "$VENV_DIR/bin/python" ]]; then
  VENV_PYTHON="$VENV_DIR/bin/python"
elif [[ -x "$VENV_DIR/Scripts/python.exe" ]]; then
  VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
fi

if [[ -z "$VENV_PYTHON" ]]; then
  if [[ -e "$VENV_DIR" ]]; then
    echo "Erro: encontrei '$VENV_DIR', mas não localizei o executável Python do ambiente virtual." >&2
    exit 1
  fi
  echo "Criando ambiente virtual do backend..."
  "$PYTHON" -m venv "$VENV_DIR"
  if [[ -x "$VENV_DIR/bin/python" ]]; then
    VENV_PYTHON="$VENV_DIR/bin/python"
  else
    VENV_PYTHON="$VENV_DIR/Scripts/python.exe"
  fi
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
elif ! "$VENV_PYTHON" -c 'import fastapi, uvicorn, sqlalchemy, pymysql' >/dev/null 2>&1; then
  echo "Instalando dependências do backend..."
  "$VENV_PYTHON" -m pip install -r "$BACKEND_DIR/requirements.txt"
fi

for port in 8000 5500; do
  if curl --silent --fail "http://127.0.0.1:$port/" >/dev/null 2>&1 || \
     curl --silent "http://127.0.0.1:$port/" >/dev/null 2>&1; then
    echo "Erro: a porta $port já está em uso. Encerre o serviço que a utiliza e tente novamente." >&2
    exit 1
  fi
done

BACKEND_LOG="$(mktemp -t elite-backend.XXXXXX.log)"
FRONTEND_LOG="$(mktemp -t elite-frontend.XXXXXX.log)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  trap - EXIT INT TERM
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && kill "$BACKEND_PID" 2>/dev/null || true
  [[ -n "$FRONTEND_PID" ]] && wait "$FRONTEND_PID" 2>/dev/null || true
  [[ -n "$BACKEND_PID" ]] && wait "$BACKEND_PID" 2>/dev/null || true
  rm -f "$BACKEND_LOG" "$FRONTEND_LOG"
}
trap cleanup EXIT INT TERM

(
  cd "$BACKEND_DIR"
  exec "$VENV_PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

(
  cd "$FRONTEND_DIR"
  exec "$VENV_PYTHON" -m http.server 5500 --bind 127.0.0.1
) >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

echo "Iniciando backend e frontend..."
backend_ready=false
frontend_ready=false
for ((second = 0; second < STARTUP_TIMEOUT; second++)); do
  if curl --silent --fail "$BACKEND_URL/health" >/dev/null 2>&1; then backend_ready=true; fi
  if curl --silent --fail "$FRONTEND_URL/" >/dev/null 2>&1; then frontend_ready=true; fi
  [[ "$backend_ready" == true && "$frontend_ready" == true ]] && break

  if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$backend_ready" != true || "$frontend_ready" != true ]]; then
  echo "Erro: os serviços não ficaram prontos." >&2
  if [[ "$backend_ready" != true ]]; then
    echo "\n--- Log do backend ---" >&2
    cat "$BACKEND_LOG" >&2
  fi
  if [[ "$frontend_ready" != true ]]; then
    echo "\n--- Log do frontend ---" >&2
    cat "$FRONTEND_LOG" >&2
  fi
  exit 1
fi

echo
echo "Cliente iniciado com sucesso:"
echo "Frontend: $FRONTEND_URL"
echo "Backend:  $BACKEND_URL"
echo "Swagger:  $BACKEND_URL/docs"
echo
echo "Pressione Ctrl+C para encerrar os dois serviços."
wait -n "$BACKEND_PID" "$FRONTEND_PID"
