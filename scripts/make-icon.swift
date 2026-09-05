// Generates the application icon from the bundled spritesheet.
//
// Source: char_07 frame 57 — a 200x200 square at (0, 1781). That frame was
// chosen because it is the largest clean, front-facing pose in the whole set.
// Every larger frame in the atlases is either fire blowout from the spawn or
// the near-black fade at the end of the animation.
//
// Swift rather than Node because the atlases are WebP and decoding that in
// Node would need a dependency. macOS decodes it natively through ImageIO.
//
//   swiftc -O scripts/make-icon.swift -o /tmp/make-icon
//   /tmp/make-icon assets/desktop/char_07_desktop.webp build/icon.png
import Foundation
import AppKit
import ImageIO

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("usage: make-icon <atlas.webp> <out.png>\n".data(using: .utf8)!)
    exit(2)
}

let FRAME = CGRect(x: 0, y: 1781, width: 200, height: 200)
let SIZE = 1024
let PAD = 0.03

guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let atlas = CGImageSourceCreateImageAtIndex(src, 0, nil),
      let cut = atlas.cropping(to: FRAME) else {
    FileHandle.standardError.write("could not read or crop \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let ctx = CGContext(data: nil, width: SIZE, height: SIZE, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.interpolationQuality = .high
ctx.clear(CGRect(x: 0, y: 0, width: SIZE, height: SIZE))

let inset = Double(SIZE) * PAD
let box = Double(SIZE) - inset * 2
let scale = min(box / Double(cut.width), box / Double(cut.height))
let w = Double(cut.width) * scale
let h = Double(cut.height) * scale
ctx.draw(cut, in: CGRect(x: (Double(SIZE) - w) / 2, y: (Double(SIZE) - h) / 2, width: w, height: h))

let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2]) at \(SIZE)x\(SIZE)")
