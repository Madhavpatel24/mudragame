import "./globals.css";

export const metadata = { title: "Samyukta Hasta Challenge" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}