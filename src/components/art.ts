import libraryHero from "../assets/art/library-hero.jpg";
import creationRitual from "../assets/art/creation-ritual.jpg";
import veil from "../assets/art/veil.jpg";
import sigil from "../assets/art/sigil.png";
import waxSeal from "../assets/art/wax-seal.png";
import emptyTome from "../assets/art/empty-tome.png";
import divider from "../assets/art/divider.png";
import paperclip from "../assets/art/paperclip.png";
import tape from "../assets/art/tape.png";
import emblemHp from "../assets/art/emblem-hp.png";
import emblemMp from "../assets/art/emblem-mp.png";
import emblemSan from "../assets/art/emblem-san.png";
import emblemLuck from "../assets/art/emblem-luck.png";

const base = import.meta.env.BASE_URL;

export const ART = {
  street: `${base}art/arkham-rain.jpg`,
  streetSmall: `${base}art/arkham-rain-small.jpg`,
  desk: `${base}art/investigation-desk.jpg`,
  libraryHero,
  creationRitual,
  veil,
  sigil,
  waxSeal,
  emptyTome,
  divider,
  paperclip,
  tape,
};

export const EMBLEMS = {
  hp: emblemHp,
  mp: emblemMp,
  san: emblemSan,
  luck: emblemLuck,
} as const;

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
