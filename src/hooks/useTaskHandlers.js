import { useApp } from "../context/AppData.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { useModals } from "../components/ModalHost.jsx";

// Shared handlers for TaskRow: open the task modal, and toggle done while
// surfacing the Definition-of-Done gate message when a task can't be completed.
export function useTaskHandlers() {
  const { quickToggle } = useApp();
  const dlg = useDialog();
  const modals = useModals();

  const toggle = async (id) => {
    const r = await quickToggle(id);
    if (r && r.ok === false) await dlg.alert(r.message);
  };

  return { toggle, openTask: modals.openTask };
}
