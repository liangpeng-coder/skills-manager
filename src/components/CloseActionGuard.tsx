import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CloseActionDialog } from "./CloseActionDialog";
import * as api from "../lib/tauri";

export function CloseActionGuard() {
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const unlisten = listen("window-close-requested", async () => {
      const pref = await api.getSettings("close_action");
      if (pref === "close") {
        api.appExit();
      } else if (pref === "hide") {
        await api.hideToTray();
      } else {
        setDialogOpen(true);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleClose = async (remember: boolean) => {
    setDialogOpen(false);
    if (remember) await api.setSettings("close_action", "close");
    api.appExit();
  };

  const handleHide = async (remember: boolean) => {
    setDialogOpen(false);
    if (remember) await api.setSettings("close_action", "hide");
    await api.hideToTray();
  };

  return (
    <CloseActionDialog
      open={dialogOpen}
      onCancel={() => setDialogOpen(false)}
      onClose={handleClose}
      onHide={handleHide}
    />
  );
}
