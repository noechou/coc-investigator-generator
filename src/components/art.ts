const base = import.meta.env.BASE_URL;

export const ART = {
  street: `${base}art/arkham-rain.jpg`,
  streetSmall: `${base}art/arkham-rain-small.jpg`,
  desk: `${base}art/investigation-desk.jpg`,
};

export const PORTRAITS = [
  {
    id: "investigator",
    label: "调查员",
    src: `${base}art/portrait-investigator.jpg`,
  },
  {
    id: "journalist",
    label: "记者",
    src: `${base}art/portrait-journalist.jpg`,
  },
  { id: "scholar", label: "学者", src: `${base}art/portrait-scholar.jpg` },
] as const;

// Preset portraits enter the same portable format as uploaded images.
export async function loadPortrait(src: string): Promise<string> {
  const response = await fetch(src);
  if (!response.ok) throw new Error("肖像暂时无法读取，请重试或上传图片。");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("肖像读取失败，请重试。"));
    reader.readAsDataURL(blob);
  });
}
