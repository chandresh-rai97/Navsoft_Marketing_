import { useApp } from "../context/AppData.jsx";
import { useDialog } from "../components/Dialog.jsx";
import { useModals } from "../components/ModalHost.jsx";
import { useToast } from "../components/Toast.jsx";

const repeats = (t) => t && t.recurrence && t.recurrence !== "none";

// Shared handlers for TaskRow: open the task modal, and toggle done while
// surfacing the Definition-of-Done gate message when a task can't be completed.
// Completing a one-time task offers Undo; a repeating one asks first (completing
// it creates the next occurrence, which Undo couldn't take back).
export function useTaskHandlers() {
  const { db, quickToggle, undoComplete } = useApp();
  const dlg = useDialog();
  const modals = useModals();
  const { toast } = useToast();

  const toggle = async (id) => {
    const before = db.tasks.find((x) => x.id === id);
    const completing = before && before.status !== "done" && before.status !== "done_pending_acceptance";
    if (completing && repeats(before) && !(before.acceptance_required)) {
      const ok = await dlg.confirm(
        `“${before.title}” repeats. Marking it done also creates the next occurrence. Are you sure?`
      );
      if (!ok) return;
    }
    const r = await quickToggle(id);
    if (r && r.failed) return; // "Couldn't save – Retry" is already showing
    if (r && r.ok === false) {
      if (r.message) await dlg.alert(r.message);
      return;
    }
    if (completing && !repeats(before)) {
      toast({
        message: before.acceptance_required ? "Sent for acceptance." : "Marked done.",
        action: { label: "Undo", onClick: () => undoComplete(before) },
      });
    }
  };

  return { toggle, openTask: modals.openTask };
}
