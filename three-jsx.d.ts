import * as THREE from 'three'
import { ThreeElements } from '@react-three/fiber'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// This is a safety fallback for some build environments
declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
