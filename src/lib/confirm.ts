/** A single in-app confirmation sheet shared by all screens. */
export function confirmInApp(message: string): Promise<boolean> {
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent("tripjunkies-confirm", { detail: { message, resolve } }));
  });
}
