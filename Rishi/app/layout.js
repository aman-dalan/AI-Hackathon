import "./globals.css"

export const metadata = {
  title: "DSA Preparation Coach",
  description: "AI-powered coding interview preparation platform",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" speedupyoutubeads="false" resize="390,702">
      <body className="min-h-screen bg-gray-50" cz-shortcut-listen="true">{children}</body>
    </html>
  )
}
