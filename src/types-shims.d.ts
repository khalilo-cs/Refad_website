declare module "arabic-reshaper" {
  const R: { convertArabic(text: string): string; convertArabicBack(text: string): string };
  export default R;
}
