import gi
import pathlib
import sys
gi.require_version('IBus', '1.0')
from gi.repository import GLib, IBus
p=pathlib.Path(sys.argv[1])
IBus.init()
bus=IBus.Bus()
assert bus.is_connected(), 'private IBus unavailable'
instances=[]
contexts={}
class Engine(IBus.Engine):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.props.active_surrounding_text = False
        instances.append(self)
        print('engine initialized', flush=True)
    def do_focus_in(self):
        print('focus in', flush=True)
    def do_focus_out(self):
        print('focus out', flush=True)
    def do_reset(self):
        print('reset', flush=True)
    def do_set_content_type(self, purpose, hints):
        print('content type', purpose, flush=True)
    def do_set_surrounding_text(self, *_):
        pass
name='remote-gui-probe'
factory=IBus.Factory.new(bus.get_connection())
factory.add_engine(name, Engine.__gtype__)
component=IBus.Component.new('org.freedesktop.IBus.RemoteGuiProbe',name,'0','MIT','local fixture','','','')
component.add_engine(IBus.EngineDesc.new(name,name,'synthetic-only','en','MIT','local fixture','','us'))
assert bus.register_component(component), 'private component registration failed'
def consume():
    request=p/'commit'
    if request.exists() and instances:
        request.unlink()
        address = bus.current_input_context()
        if not address:
            print('missing current native input context', flush=True)
            return True
        context=contexts.setdefault(address, len(contexts)+1)
        print('current native input context',context,flush=True)
        instances[-1].commit_text(IBus.Text.new_from_string('z'))
        print('commit emitted', flush=True)
    return True
GLib.timeout_add(50,consume)
(p/'engine-ready').touch()
GLib.MainLoop().run()
