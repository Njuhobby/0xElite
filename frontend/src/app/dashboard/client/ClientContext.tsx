'use client';

import { createContext, useContext } from 'react';

type ClientStatus = 'loading' | 'registered' | 'unregistered';

interface ClientContextValue {
  clientStatus: ClientStatus;
  setClientStatus: (status: ClientStatus) => void;
}

export const ClientContext = createContext<ClientContextValue>({
  clientStatus: 'loading',
  setClientStatus: () => {},
});

export function useClientStatus() {
  return useContext(ClientContext);
}
