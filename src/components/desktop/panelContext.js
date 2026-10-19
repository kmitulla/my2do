import { createContext, useContext, useEffect } from "react";

// Steuerung des Desktop-Panels (anheften, einfahren, Overlays) für die
// Kopfleiste der App. Im Browser und in eigenen Fenstern: null.
export const PanelContext = createContext(null);
export const usePanel = () => useContext(PanelContext);

// Kopfleiste meldet sich an → das Panel blendet seine eigene Mini-Steuerung aus
export function useRegisterAppBar() {
  const panel = usePanel();
  useEffect(() => panel?.registerAppBar(), [panel]);
}
