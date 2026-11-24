/** Passes a workbook from the Forms page to the Generate page within the same browser tab */
const KEY = "athryan_generate_handoff";

export function saveHandoff(fileName: string, bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  sessionStorage.setItem(KEY, JSON.stringify({ fileName, data: btoa(bin) }));
}

export function takeHandoff(): File | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const { fileName, data } = JSON.parse(raw);
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], fileName, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  } catch {
    return null;
  }
}
