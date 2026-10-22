                                                                              
export const tourChapters = [
  { title: 'Meet the tensioning roller', duration: 10, explosion: 0, groups: ['roller', 'arm'],
    text: 'A free-running roller guides the belt. Its shaft and swing arm carry the belt load into the mounting.', detail: '19 CAD parts / one assembly' },
  { title: 'Open the assembly', duration: 14, explosion: .65, groups: [], identify: true,
    text: 'The parts separate along the shaft axis. Follow the roller, two bearings, spacer, covers and the arm connection.', detail: 'Exploded spacing is illustrative' },
  { title: 'The roller turns, the shaft stays', duration: 14, explosion: 0, groups: ['roller', 'cover_open', 'cover_closed', 'screw_m5'], spin: true,
    text: 'The belt drives the roller body around the fixed shaft. The end covers and their M5 screws turn with the roller.', detail: 'Rotation arrow / illustrative speed' },
  { title: 'Bearings and the spacer', duration: 14, explosion: .4, groups: ['bearing6207', 'bushing'], ghost: true,
    text: 'Two SKF 6207 bearings support the rotating roller. The sleeve spaces the outer rings; the shaft supports the inner rings.', detail: 'Transparent shells reveal the bearing stack' },
  { title: 'The load path into the arm', duration: 14, explosion: .55, groups: ['shaft', 'key', 'arm', 'screw_m12'],
    text: 'The shaft carries the roller load into the swing arm. The parallel key locks their relative rotation; the M12 end fastener retains the connection.', detail: 'Arm position sets belt take-up / the external hold is not included' },
  { title: 'Covers, seal and fasteners', duration: 12, explosion: .55, groups: ['cover_open', 'cover_closed', 'seal', 'screw_m5'],
    text: 'The end covers close the roller. The radial shaft seal sits at the open end, and the eight M5 screws secure the two covers.', detail: 'Covers and seal / retention and protection' },
  { title: 'Look inside', duration: 14, explosion: 0, groups: ['bearing6207', 'bushing', 'shaft'], section: true,
    text: 'A moving section exposes the bearing arrangement inside the assembled roller. Pause here to study how the parts fit.', detail: 'Clipped CAD surfaces / cut faces are open' },
  { title: 'Back together', duration: 12, explosion: 0, groups: [],
    text: 'The complete assembly is back together. Replay a chapter, or finish the tour and explore the parts and drawings yourself.', detail: 'Tour complete / continue with free inspection' }
];
export const tourDuration = tourChapters.reduce((sum, chapter) => sum + chapter.duration, 0);
export const chapterStart = index => tourChapters.slice(0, index).reduce((sum, chapter) => sum + chapter.duration, 0);
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export function sampleTour(seconds) {
  const time = Math.max(0, Math.min(tourDuration, Number.isFinite(seconds) ? seconds : 0));
  let index = 0, start = 0;
  while (index < tourChapters.length - 1 && time >= start + tourChapters[index].duration) start += tourChapters[index++].duration;
  const chapter = tourChapters[index], progress = Math.min(1, (time - start) / chapter.duration);
  const previous = tourChapters[Math.max(0, index - 1)];
  return { chapter, index, progress, time, complete: time >= tourDuration,
    explosion: previous.explosion + (chapter.explosion - previous.explosion) * smooth(progress / .45),
                                                            
    angle: .28 + Math.PI * 2 * smooth(time / tourDuration),
    cut: chapter.section ? .18 + .64 * smooth(progress) : .5,
    spinAngle: chapter.spin ? Math.PI * 4 * smooth((progress - .45) / .55) : 0 };
}
