import React from "react";

export const SelectionContext = React.createContext({
  selecionados: [],
  setSelecionados: () => {},
  limparSelecao: () => {},
});
