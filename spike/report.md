# DOM spike report

50 candidates, 49 labelled, 21 in the semantic-mismatch group. Setups: A image, B dom, C image+dom, each run twice.

## Decision

None of the three rules holds.

| Rule | Holds | The numbers |
|---|---|---|
| Continue | no | C right in both runs on 54% (13/24) of Button / Link; clear cases made worse 39% (7/18) against A's run-to-run disagreement 2% (1/50) |
| Rethink the inputs | no | B − C accuracy 12 pp, confident precision 24 pp, against C's run-to-run disagreement 2% (1/50) |
| Look at the guide | no | A and C differ on 17 of 50 candidates; A differs from itself on 1 |

## 1. Accuracy

Answers equal to the label, over labelled candidates with a completed call.

| Setup | Run 1 | Run 2 | Pooled | Without mismatches | Role names an entry | Role does not |
|---|---|---|---|---|---|---|
| A image | 71% (35/49) | 69% (34/49) | 70% (69/98) | 75% (42/56) | 63% (49/78) | 100% (20/20) |
| B dom | 51% (25/49) | 53% (26/49) | 52% (51/98) | 71% (40/56) | 50% (39/78) | 60% (12/20) |
| C image+dom | 65% (32/49) | 63% (31/49) | 64% (63/98) | 79% (44/56) | 58% (45/78) | 90% (18/20) |

## 2. Confident precision

Right answers among `confident` verdicts, both runs pooled, with the count they rest on.

| Setup | All | Role names an entry | Role does not |
|---|---|---|---|
| A image | 90% of 40 | 89% of 36 | 100% of 4 |
| B dom | 56% of 41 | 53% of 38 | 100% of 3 |
| C image+dom | 80% of 46 | 75% of 36 | 100% of 10 |

## 3. Movement from A to C

Run 1, 50 candidates. Rows are A's verdict, columns are C's.

| A \ C | confident | check | unsure |
|---|---|---|---|
| confident | 11 | 9 | 0 |
| check | 11 | 16 | 0 |
| unsure | 0 | 2 | 1 |

Run 2, 50 candidates. Rows are A's verdict, columns are C's.

| A \ C | confident | check | unsure |
|---|---|---|---|
| confident | 12 | 7 | 1 |
| check | 12 | 15 | 0 |
| unsure | 0 | 2 | 1 |

## 4. Changed answers

### github-com-expressjs-express-f12f3d8c/e56 (label Button)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (confident) | Button 1.00, Icon Button 0.00, Link 0.00 | Link (check) | Link 0.77, Button 0.23, Icon Button 0.00 |
| 2 | Button (confident) | Button 0.99, Link 0.01, Icon Button 0.00 | Link (check) | Link 0.75, Button 0.25, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Sign in"
- visible text: "Sign in"
- href: present, "/login?return_to=https%3A%2F%2Fgithub.com%2Fexpressjs%2Fexpress"
- width (computed): 72.0938px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0.01)
- border (computed): 1px solid rgb(38, 44, 40)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role generic
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e59 (label Button)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (confident) | Button 1.00, Icon Button 0.00, Link 0.00 | Button (check) | Button 0.54, Link 0.46, Icon Button 0.00 |
| 2 | Button (confident) | Button 1.00, Icon Button 0.00, Link 0.00 | Link (unsure) | Link 0.51, Button 0.49, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Sign up"
- visible text: "Sign up"
- href: present, "/signup?ref_cta=Sign+up&ref_loc=header+logged+out&ref_page=%2F%3Cuser-name%3E%2F%3Crepo-name%3E&source=header-repo&source_repo=expressjs%2Fexpress"
- width (computed): 77.1562px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(255, 255, 255, 0.12)
- border (computed): 1px solid rgba(255, 255, 255, 0.06)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e229 (label Button)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Select (check) | Select 0.53, Badge 0.19, Other 0.14 | Link (check) | Link 0.90, Button 0.07, Chip 0.01 |
| 2 | Select (check) | Select 0.58, Badge 0.18, Other 0.13 | Link (check) | Link 0.90, Button 0.06, Chip 0.02 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a type="button">
- role: link
- accessible name: "15 Branches"
- visible text: "15 Branches"
- href: present, "/expressjs/express/branches"
- width (computed): 115.359px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 1px solid rgba(255, 255, 255, 0)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e295 (label Button)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Badge (check) | Badge 0.65, Other 0.27, Link 0.08 | Link (confident) | Link 1.00, Button 0.00, Icon Button 0.00 |
| 2 | Badge (check) | Badge 0.68, Other 0.26, Link 0.06 | Link (confident) | Link 1.00, Button 0.00, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "6,181 Commits"
- visible text: "6,181 Commits"
- href: present, "/expressjs/express/commits/master/"
- width (computed): 122.734px
- height (computed): 28px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 1px solid rgba(255, 255, 255, 0)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e1237 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Link (check) | Link 0.78, Button 0.21, Other 0.01 | Button (confident) | Button 0.92, Link 0.08, Icon Button 0.00 |
| 2 | Link (check) | Link 0.79, Button 0.20, Other 0.01 | Button (confident) | Button 0.93, Link 0.07, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <button type="button">
- role: button
- accessible name: "Manage cookies"
- visible text: "Manage cookies"
- href: absent
- width (computed): 91.7969px
- height (computed): 18px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(89, 99, 110)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <cookie-consent-link>, role generic
- children by role: none
```

### github-com-expressjs-express-f12f3d8c/e1240 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Link (check) | Link 0.59, Button 0.29, Other 0.09 | Button (check) | Button 0.87, Link 0.12, Other 0.01 |
| 2 | Link (check) | Link 0.69, Button 0.20, Other 0.08 | Button (check) | Button 0.90, Link 0.09, Other 0.01 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <button type="button">
- role: button
- accessible name: "Do not share my personal information"
- visible text: "Do not share my personal information"
- href: absent
- width (computed): 212.047px
- height (computed): 18px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(89, 99, 110)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <cookie-consent-link>, role generic
- children by role: none
```

### github-com-expressjs-express-issues-2b00c838/e590 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Link (unsure) | Link 0.44, Other 0.41, Chip 0.08 | Button (check) | Button 0.82, Chip 0.16, Link 0.01 |
| 2 | Other (unsure) | Other 0.43, Link 0.37, Chip 0.11 | Button (check) | Button 0.86, Chip 0.12, Link 0.01 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <button type="button">
- role: button
- accessible name: "Filter by author sheplu"
- visible text: "Filter by author sheplu"
- href: absent
- width (computed): 37.5625px
- height (computed): 18px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(89, 99, 110)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <span>, role none
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e46 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (check) | Button 0.63, Link 0.29, Other 0.06 | Link (confident) | Link 0.98, Button 0.01, Tabs 0.01 |
| 2 | Button (check) | Button 0.62, Link 0.28, Other 0.08 | Link (confident) | Link 0.98, Button 0.02, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Pricing"
- visible text: "Pricing"
- href: present, "https://github.com/pricing"
- width (computed): 69.2031px
- height (computed): 40px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(255, 255, 255)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <li>, role listitem
- children by role: none
```

### github-com-expressjs-express-issues-2b00c838/e1413 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (check) | Button 0.62, Link 0.37, Other 0.01 | Link (confident) | Link 0.95, Button 0.05, Icon Button 0.00 |
| 2 | Button (check) | Button 0.56, Link 0.43, Other 0.01 | Link (confident) | Link 0.94, Button 0.06, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Next Page"
- visible text: "Next"
- href: present, "/expressjs/express/issues?q=is%3Aissue+state%3Aopen&page=2"
- width (computed): 59.9531px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(9, 105, 218)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role generic
- children by role: 1 none
```

### github-com-expressjs-express-f12f3d8c/e290 (label Link)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Other (check) | Other 0.83, Badge 0.10, Link 0.07 | Link (confident) | Link 1.00, Button 0.00, Icon Button 0.00 |
| 2 | Other (check) | Other 0.83, Badge 0.11, Link 0.06 | Link (confident) | Link 1.00, Button 0.00, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Commit a419aa7"
- visible text: "a419aa7"
- href: present, "/expressjs/express/commit/a419aa7350389a275ab45fde2e849ed1f02449ef"
- width (computed): 47.3438px
- height (computed): 18px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(89, 99, 110)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <span>, role none
- children by role: none
```

### github-com-expressjs-express-f12f3d8c/e1112 (label Badge)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Badge (unsure) | Badge 0.41, Button 0.28, Chip 0.26 | Chip (unsure) | Chip 0.40, Badge 0.38, Button 0.18 |
| 2 | Badge (unsure) | Badge 0.48, Chip 0.26, Button 0.23 | Chip (unsure) | Chip 0.42, Badge 0.36, Button 0.19 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <span>
- role: none
- accessible name: none
- visible text: "Latest"
- href: absent
- width (computed): 50.125px
- height (computed): 20px
- corner radius (computed): 9999.01px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 1px solid rgb(31, 136, 61)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: none
```

### github-com-expressjs-express-issues-2b00c838/e834 (label Chip)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Badge (check) | Badge 0.77, Chip 0.18, Other 0.05 | Chip (check) | Chip 0.67, Button 0.32, Badge 0.01 |
| 2 | Badge (check) | Badge 0.76, Chip 0.18, Other 0.06 | Chip (check) | Chip 0.58, Button 0.42, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <button type="button">
- role: button
- accessible name: "Filter by label 6.x"
- visible text: "6.x"
- href: absent
- width (computed): 40.2812px
- height (computed): 22px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(31, 35, 40)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <span>, role none
- children by role: 1 none
```

### github-com-expressjs-express-issues-7490-5c989f6a/e598 (label Chip)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Badge (check) | Badge 0.78, Chip 0.20, Button 0.01 | Link (check) | Link 0.82, Chip 0.14, Badge 0.02 |
| 2 | Badge (check) | Badge 0.81, Chip 0.16, Button 0.01 | Link (check) | Link 0.81, Chip 0.16, Button 0.01 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "bug"
- visible text: "bug"
- href: present, "https://github.com/expressjs/express/issues?q=state%3Aopen%20label%3A%22bug%22"
- width (computed): 40.625px
- height (computed): 20px
- corner radius (computed): 0px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(89, 99, 110)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role generic
- children by role: 2 generic
```

### github-com-expressjs-express-f12f3d8c/e49 (label Search Field)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Search Field (check) | Search Field 0.67, Button 0.28, Other 0.02 | Button (check) | Button 0.84, Search Field 0.16, Icon Button 0.00 |
| 2 | Search Field (check) | Search Field 0.68, Button 0.27, Text Input 0.02 | Button (check) | Button 0.85, Search Field 0.15, Icon Button 0.00 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <button type="button">
- role: button
- accessible name: "Search or jump to, type / to search"
- visible text: "Search /"
- href: absent
- aria-expanded: "false"
- width (computed): 200px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0.01)
- border (computed): 1px solid rgb(38, 44, 40)
- position (computed): static
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: 1 none
```

### github-com-expressjs-express-pull-7512-aa016a4b/e199 (label Tabs)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (unsure) | Button 0.36, Badge 0.21, Chip 0.16 | Link (check) | Link 0.71, Tabs 0.11, Chip 0.09 |
| 2 | Button (unsure) | Button 0.42, Badge 0.19, Chip 0.13 | Link (check) | Link 0.73, Tabs 0.11, Chip 0.07 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Conversation  (0)"
- visible text: "Conversation0 (0)"
- href: present, "/expressjs/express/pull/7512"
- width (computed): 164.938px
- height (computed): 39.9531px
- corner radius (computed): 6px 6px 0px 0px
- background colour (computed): rgb(255, 255, 255)
- border (computed): top 1px solid rgb(209, 217, 224); right 1px solid rgb(209, 217, 224); bottom 0px none rgb(209, 217, 224); left 1px solid rgb(209, 217, 224)
- position (computed): relative
- z-index (computed): auto
- cursor (computed): pointer
- parent: <div>, role none
- children by role: 3 none
```

### github-com-expressjs-express-f12f3d8c/e141 (label Tabs)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Button (check) | Button 0.79, Tabs 0.14, Link 0.05 | Link (check) | Link 0.75, Tabs 0.16, Button 0.08 |
| 2 | Button (check) | Button 0.82, Tabs 0.10, Link 0.06 | Link (check) | Link 0.75, Tabs 0.15, Button 0.09 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Insights"
- visible text: "Insights"
- href: present, "/expressjs/express/pulse"
- width (computed): 93.8594px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(31, 35, 40)
- position (computed): relative
- z-index (computed): auto
- cursor (computed): pointer
- parent: <li>, role listitem
- children by role: 2 none
```

### github-com-expressjs-express-f12f3d8c/e589 (label Tabs)

| Run | A | A top three | C | C top three |
|---|---|---|---|---|
| 1 | Tabs (check) | Tabs 0.58, Link 0.31, Button 0.06 | Link (check) | Link 0.70, Tabs 0.28, Button 0.01 |
| 2 | Tabs (check) | Tabs 0.58, Link 0.31, Button 0.05 | Link (check) | Link 0.69, Tabs 0.29, Button 0.01 |

DOM facts sent:

```
Read from the page's DOM and computed style:
- element: <a>
- role: link
- accessible name: "Code of conduct"
- visible text: "Code of conduct"
- href: present, "#"
- width (computed): 151.703px
- height (computed): 32px
- corner radius (computed): 6px
- background colour (computed): rgba(0, 0, 0, 0)
- border (computed): 0px none rgb(31, 35, 40)
- position (computed): relative
- z-index (computed): auto
- cursor (computed): pointer
- parent: <li>, role listitem
- children by role: 2 none
```

## 5. Stability

Run 1 against run 2, over every candidate with both runs complete, labelled or not.

| Setup | Candidates | Same answer | Same verdict |
|---|---|---|---|
| A image | 50 | 98% (49/50) | 100% (50/50) |
| B dom | 50 | 98% (49/50) | 94% (47/50) |
| C image+dom | 50 | 98% (49/50) | 94% (47/50) |

## 6. Semantic mismatches

The picture and the tag disagree. These are findings about the site, not errors in the identification.

| Candidate | Label | Looks like | Tag or role says | Why |
|---|---|---|---|---|
| github-com-expressjs-express-f12f3d8c/e56 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e59 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-pull-7512-aa016a4b/e415 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-issues-2b00c838/e261 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e181 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e229 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e295 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-pull-7512-aa016a4b/e352 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-pulls-b9a648e7/e166 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e1237 | Link | – | action (role button) | role button implies action, the label is navigation |
| github-com-expressjs-express-f12f3d8c/e1240 | Link | – | action (role button) | role button implies action, the label is navigation |
| github-com-expressjs-express-issues-2b00c838/e590 | Link | – | action (role button) | role button implies action, the label is navigation |
| github-com-expressjs-express-issues-2b00c838/e374 | Select | – | action (role button) | role button implies action, the label is selection |
| github-com-expressjs-express-f12f3d8c/e199 | Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-issues-2b00c838/e309 | Search Field | – | action (role button) | role button implies action, the label is text_entry |
| github-com-expressjs-express-f12f3d8c/e1214 | Icon Button | – | navigation (role link) | role link implies navigation, the label is action |
| github-com-expressjs-express-f12f3d8c/e1023 | Chip | – | navigation (role link) | role link implies navigation, the label is selection |
| github-com-expressjs-express-issues-2b00c838/e834 | Chip | – | action (role button) | role button implies action, the label is selection |
| github-com-expressjs-express-issues-7490-5c989f6a/e598 | Chip | – | navigation (role link) | role link implies navigation, the label is selection |
| github-com-expressjs-express-f12f3d8c/e49 | Search Field | – | action (role button) | role button implies action, the label is text_entry |
| github-com-expressjs-express-f12f3d8c/e216 | Select | – | action (role button) | role button implies action, the label is selection |

## Button / Link

| Setup | Accuracy |
|---|---|
| A image | 60% (29/48) |
| B dom | 52% (25/48) |
| C image+dom | 56% (27/48) |

| Candidate | Label | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---|---|---|---|---|---|---|
| github-com-expressjs-express-f12f3d8c/e56 | Button | Button ✓ | Button ✓ | Link ✗ | Link ✗ | Link ✗ | Link ✗ |
| github-com-expressjs-express-f12f3d8c/e59 | Button | Button ✓ | Button ✓ | Link ✗ | Link ✗ | Button ✓ | Link ✗ |
| github-com-expressjs-express-pull-7512-aa016a4b/e415 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-issues-2b00c838/e261 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-f12f3d8c/e181 | Button | Button ✓ | Button ✓ | Link ✗ | Link ✗ | Button ✓ | Button ✓ |
| github-com-expressjs-express-f12f3d8c/e229 | Button | Select ✗ | Select ✗ | Link ✗ | Link ✗ | Link ✗ | Link ✗ |
| github-com-expressjs-express-f12f3d8c/e295 | Button | Badge ✗ | Badge ✗ | Link ✗ | Link ✗ | Link ✗ | Link ✗ |
| github-com-expressjs-express-pull-7512-aa016a4b/e352 | Button | Link ✗ | Link ✗ | Link ✗ | Link ✗ | Link ✗ | Link ✗ |
| github-com-expressjs-express-pulls-b9a648e7/e166 | Button | Chip ✗ | Chip ✗ | Link ✗ | Link ✗ | Chip ✗ | Chip ✗ |
| github-com-expressjs-express-f12f3d8c/e1237 | Link | Link ✓ | Link ✓ | Button ✗ | Button ✗ | Button ✗ | Button ✗ |
| github-com-expressjs-express-f12f3d8c/e1240 | Link | Link ✓ | Link ✓ | Button ✗ | Button ✗ | Button ✗ | Button ✗ |
| github-com-expressjs-express-issues-2b00c838/e590 | Link | Link ✓ | Other ✗ | Button ✗ | Button ✗ | Button ✗ | Button ✗ |
| github-com-expressjs-express-pull-7512-aa016a4b/e310 | Icon Button | Icon Button ✓ | Icon Button ✓ | Button ✗ | Button ✗ | Icon Button ✓ | Icon Button ✓ |
| github-com-expressjs-express-f12f3d8c/e254 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-f12f3d8c/e174 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-issues-2b00c838/e374 | Select | Select ✓ | Select ✓ | Button ✗ | Select ✓ | Select ✓ | Select ✓ |
| github-com-expressjs-express-pull-7512-aa016a4b/e393 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-f12f3d8c/e22 | Button | Select ✗ | Select ✗ | Button ✓ | Button ✓ | Select ✗ | Select ✗ |
| github-com-expressjs-express-f12f3d8c/e46 | Link | Button ✗ | Button ✗ | Link ✓ | Link ✓ | Link ✓ | Link ✓ |
| github-com-expressjs-express-issues-2b00c838/e1413 | Link | Button ✗ | Button ✗ | Link ✓ | Link ✓ | Link ✓ | Link ✓ |
| github-com-expressjs-express-f12f3d8c/e290 | Link | Other ✗ | Other ✗ | Link ✓ | Link ✓ | Link ✓ | Link ✓ |
| github-com-expressjs-express-f12f3d8c/e628 | Link | Link ✓ | Link ✓ | Link ✓ | Link ✓ | Link ✓ | Link ✓ |
| github-com-expressjs-express-f12f3d8c/e199 | Button | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ | Button ✓ |
| github-com-expressjs-express-issues-2b00c838/e332 | Button | Select ✗ | Select ✗ | Button ✓ | Button ✓ | Select ✗ | Select ✗ |

## Run

- Calls: 300 (300 completed, 0 failed)
- Cost: $0.0665 for 1,582,446 input tokens
- Wall-clock: 33.0 s, 2026-10-19T07:33:34.049Z to 2026-10-19T07:34:07.023Z
- Model: jev-1.13.0; guide version 0.1.0

## Captures

- https://github.com/expressjs/express (captured 2026-10-17T11:32:16.124Z)
- https://github.com/expressjs/express/pull/7512 (captured 2026-10-17T11:32:37.673Z)
- https://github.com/expressjs/express/issues (captured 2026-10-17T11:32:22.136Z)
- https://github.com/expressjs/express/pulls (captured 2026-10-17T11:32:27.131Z)
- https://github.com/expressjs/express/issues/7490 (captured 2026-10-17T11:32:32.710Z)

## Conclusion

_To be written by hand._
