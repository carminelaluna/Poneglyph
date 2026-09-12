begin;

grant execute on function public.has_role(text) to anon;
grant execute on function public.my_role() to anon;

commit;

