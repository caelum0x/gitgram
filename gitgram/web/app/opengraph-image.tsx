import { ImageResponse } from 'next/og'

export const alt = 'Gitgram - Where Code Becomes Community'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              background: '#3b82f6',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            G
          </div>
          <span style={{ color: 'white', fontSize: 48, fontWeight: 700 }}>
            Gitgram
          </span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 28, margin: 0 }}>
          Where Code Becomes Community
        </p>
      </div>
    ),
    {
      ...size,
    }
  )
}
