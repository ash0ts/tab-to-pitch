# Teacher capability compatibility

The integrated client uses `teacher-v5` on `/api/teacher/next`. Its explicit capability list must match the supplied listening, teaching-practice, homework, live-input and Ear Lab contexts. Existing v1, v2, v3, v4 and teacher-live-v1 clients retain their validated semantics.

Two historical branches used teacher-v3: teaching practice and Ear Lab. The server validates their distinct payload shapes and rejects a v3 request containing both. Combined clients must use v5. The optional localAudio binding stays outside the model context and must match the current Ear Lab revision. Neither actor nor critic receives the asset binding.

Worker absence does not disable listening, homework, arrangements or the local teacher. Ear Lab analysis jobs are asynchronous; a job receipt does not reveal answers, save a variation or trigger another paid turn.
