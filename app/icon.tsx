import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d9488',
          borderRadius: 96,
        }}
      >
        <div
          style={{
            display: 'flex',
            color: 'white',
            fontSize: 300,
            fontWeight: 700,
            fontFamily: 'sans-serif',
          }}
        >
          O
        </div>
      </div>
    ),
    { ...size }
  )
}
