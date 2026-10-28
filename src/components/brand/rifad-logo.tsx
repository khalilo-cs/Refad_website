/**
 * شعار منصة رِفاد — مكوّن React.
 * درع سداسي ذهبي يحتضن كتاباً مفتوحاً ونجمةً وقوس نموّ.
 * الرسم مضمَّن كـ SVG ليبقى حاداً على أي حجم وبلا طلب شبكة.
 */

type Props = {
  /** الحجم بالبكسل (للرمز) */
  size?: number;
  /** إظهار الاسم بجانب الرمز */
  withText?: boolean;
  /** نمط الألوان */
  tone?: "dark" | "light";
  /** إظهار السطر التعريفي تحت الاسم */
  withTagline?: boolean;
  className?: string;
  /** معرّف فريد لتدرّجات SVG عند تكرار الشعار في صفحة واحدة */
  id?: string;
};

export default function RifadLogo({
  size = 40,
  withText = false,
  tone = "dark",
  withTagline = true,
  className = "",
  id = "rf",
}: Props) {
  const nameColor = tone === "light" ? "#FFFFFF" : "#0B2545";
  const subColor = tone === "light" ? "rgba(255,255,255,0.60)" : "#5A6B7B";
  const g = (n: string) => `${id}-${n}`;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id={g("navy")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#123A66" />
            <stop offset="0.55" stopColor="#0B2545" />
            <stop offset="1" stopColor="#061729" />
          </linearGradient>
          <linearGradient id={g("gold")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F0D77A" />
            <stop offset="0.5" stopColor="#C9A227" />
            <stop offset="1" stopColor="#8E6F16" />
          </linearGradient>
          <linearGradient id={g("teal")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#17A89A" />
            <stop offset="1" stopColor="#0E7C66" />
          </linearGradient>
          <linearGradient id={g("page")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E6EEF6" />
          </linearGradient>
        </defs>

        {/* الدرع */}
        <path
          d="M48 4.5 L83.5 24.6 Q87.5 26.9 87.5 31.5 L87.5 61.8 Q87.5 70.5 80.2 75.4 L52.3 92.4 Q48 95 43.7 92.4 L15.8 75.4 Q8.5 70.5 8.5 61.8 L8.5 31.5 Q8.5 26.9 12.5 24.6 Z"
          fill={`url(#${g("navy")})`}
          stroke={`url(#${g("gold")})`}
          strokeWidth="2.6"
        />
        <path
          d="M48 10.5 L79 27 Q81.5 28.6 81.5 31.6 L81.5 61 Q81.5 67.4 76 71.1 L51 87 Q48 88.8 45 87 L20 71.1 Q14.5 67.4 14.5 61 L14.5 31.6 Q14.5 28.6 17 27 Z"
          fill="none"
          stroke="#C9A227"
          strokeOpacity="0.28"
          strokeWidth="1"
        />

        {/* النجمة */}
        <path d="M48 20 L51.4 29.6 L61 33 L51.4 36.4 L48 46 L44.6 36.4 L35 33 L44.6 29.6 Z" fill={`url(#${g("gold")})`} />
        <circle cx="48" cy="33" r="1.6" fill="#FFF6D8" />

        {/* الكتاب */}
        <path d="M21 56.5 Q32 50.5 45.2 56.8 L45.2 75.8 Q32 69.5 21 75.5 Z" fill={`url(#${g("page")})`} />
        <path d="M75 56.5 Q64 50.5 50.8 56.8 L50.8 75.8 Q64 69.5 75 75.5 Z" fill={`url(#${g("page")})`} />
        <path d="M48 56.6 L48 76.2" stroke="#9FB3C8" strokeWidth="1.6" strokeLinecap="round" />

        <g stroke="#B9CBDB" strokeWidth="1.15" strokeLinecap="round">
          <path d="M26.5 60.4 L40 62.6" />
          <path d="M26.5 65.2 L40 67.4" />
          <path d="M26.5 70 L37 71.9" />
          <path d="M69.5 60.4 L56 62.6" />
          <path d="M69.5 65.2 L56 67.4" />
          <path d="M69.5 70 L59 71.9" />
        </g>

        {/* قوس النمو */}
        <path d="M22 83.5 Q48 74 74 83.5" fill="none" stroke={`url(#${g("teal")})`} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="74" cy="83.5" r="2.6" fill="#17A89A" />
      </svg>

      {withText && (
        <span className="flex flex-col leading-none">
          <span
            className="font-heading"
            style={{
              color: nameColor,
              fontSize: Math.max(15, size * 0.44),
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            رِفاد
          </span>
          {withTagline && (
            <span
              style={{
                color: subColor,
                fontSize: Math.max(8.5, size * 0.185),
                marginTop: Math.max(3, size * 0.075),
                letterSpacing: "0.02em",
              }}
            >
              للمتابعة والجودة المدرسية
            </span>
          )}
        </span>
      )}
    </span>
  );
}
