import { useEvent } from "./use-event";

export const useWindowEvents = () => {
  useEvent("beforeunload", (event) => {
    (event || window.event).returnValue = "Are you sure you want to leave?";
  });
};
