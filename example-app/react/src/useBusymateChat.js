import { useEffect, useRef, useState } from "react";
import { createBusymateChat } from "@busymate/ai-web";

/**
 * Mount one Busymate AI chat for the lifetime of the component, and expose
 * its link status. `createBusymateChat` is SSR-safe, but mount only in an
 * effect: the DOM exists there, and StrictMode's double effect unmounts cleanly.
 */
export function useBusymateChat(options) {
  const [chat, setChat] = useState(null);
  const [linkStatus, setLinkStatus] = useState(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const key = `${options.assistant}|${options.origin ?? ""}|${options.mode ?? "launcher"}|${options.locale ?? ""}`;

  useEffect(() => {
    const instance = createBusymateChat({
      ...optionsRef.current,
      // Always call the latest provider (your auth state changes between renders).
      getIdentity: optionsRef.current.getIdentity ? (request) => optionsRef.current.getIdentity(request) : undefined,
    });
    const off = instance.onLinkStatus(setLinkStatus);
    instance.mount();
    setChat(instance);
    return () => {
      off();
      instance.unmount();
      setChat(null);
    };
  }, [key]);

  return { chat, linkStatus };
}
