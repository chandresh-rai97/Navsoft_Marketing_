import React, { createContext, useContext, useMemo, useState } from "react";
import TaskModal from "./modals/TaskModal.jsx";
import StandupModal from "./modals/StandupModal.jsx";
import CheckinModal from "./modals/CheckinModal.jsx";
import BlockerModal from "./modals/BlockerModal.jsx";
import UserModal from "./modals/UserModal.jsx";
import ProjectModal from "./modals/ProjectModal.jsx";
import ObjectiveModal from "./modals/ObjectiveModal.jsx";
import KRModal from "./modals/KRModal.jsx";
import ScoreModal from "./modals/ScoreModal.jsx";

const ModalCtx = createContext(null);
export const useModals = () => useContext(ModalCtx);

// Central host so any page can open the shared modals (task, standup, KR
// check-in, blockers, settings editors) without prop-drilling.
export function ModalHost({ children }) {
  const [m, setM] = useState(null);
  const api = useMemo(
    () => ({
      openTask: (id = null) => setM({ t: "task", id }),
      openStandup: () => setM({ t: "standup" }),
      openCheckin: (krId) => setM({ t: "checkin", krId }),
      openBlocker: () => setM({ t: "blocker" }),
      openUser: (id = null) => setM({ t: "user", id }),
      openProject: (id = null) => setM({ t: "project", id }),
      openObjective: () => setM({ t: "objective" }),
      openKR: (objId) => setM({ t: "kr", objId }),
      openScore: (krId) => setM({ t: "score", krId }),
      close: () => setM(null),
    }),
    []
  );

  return (
    <ModalCtx.Provider value={api}>
      {children}
      {m?.t === "task" && <TaskModal id={m.id} onClose={api.close} />}
      {m?.t === "standup" && <StandupModal onClose={api.close} />}
      {m?.t === "checkin" && <CheckinModal krId={m.krId} onClose={api.close} />}
      {m?.t === "blocker" && <BlockerModal onClose={api.close} />}
      {m?.t === "user" && <UserModal id={m.id} onClose={api.close} />}
      {m?.t === "project" && <ProjectModal id={m.id} onClose={api.close} />}
      {m?.t === "objective" && <ObjectiveModal onClose={api.close} />}
      {m?.t === "kr" && <KRModal objId={m.objId} onClose={api.close} />}
      {m?.t === "score" && <ScoreModal krId={m.krId} onClose={api.close} />}
    </ModalCtx.Provider>
  );
}
