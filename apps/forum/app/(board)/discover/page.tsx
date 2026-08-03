import { redirect } from 'next/navigation'

/**
 * `/discover` on its own goes to the first view.
 *
 * A redirect rather than a menu: the address is one somebody types or a theme
 * links to as a shorthand, and answering it with a page of five links means two
 * clicks to reach the list they meant. `new` is the default because it is the
 * question the other four are variations of.
 */
export default function DiscoverIndex(): never {
  redirect('/discover/new')
}
