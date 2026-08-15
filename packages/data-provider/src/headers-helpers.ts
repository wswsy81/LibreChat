import axios from 'axios';

export function setAcceptLanguageHeader(value: string): void {
  axios.defaults.headers.common['Accept-Language'] = value;
}

export function setTokenHeader(token: string | undefined) {
  if (token === undefined) {
    delete axios.defaults.headers.common['Authorization'];
  } else {
    axios.defaults.headers.common['Authorization'] = 'Bearer ' + token;
  }
}

export function getTokenHeader(): string | undefined {
  const authorization = axios.defaults.headers.common['Authorization'];
  return typeof authorization === 'string' ? authorization : undefined;
}

const LOCAL_DATA_SESSION_HEADER = 'X-Future-Lines-Local-Session';

export function setLocalDataSessionHeader(sessionId: string | undefined): void {
  if (!sessionId) {
    delete axios.defaults.headers.common[LOCAL_DATA_SESSION_HEADER];
    return;
  }
  axios.defaults.headers.common[LOCAL_DATA_SESSION_HEADER] = sessionId;
}

export function getLocalDataSessionHeader(): string | undefined {
  const value = axios.defaults.headers.common[LOCAL_DATA_SESSION_HEADER];
  return typeof value === 'string' ? value : undefined;
}
