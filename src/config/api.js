const API_BASE_URL = process.env.REACT_APP_API_BASE || "/api";

export const API_CONFIG = {
  baseUrl: API_BASE_URL,
  useBackend: process.env.REACT_APP_USE_BACKEND === "true",
};

export function apiUrl(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}

